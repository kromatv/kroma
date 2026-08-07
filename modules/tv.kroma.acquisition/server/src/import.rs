//! Import: move completed downloads into the library with the configured
//! Sonarr/Radarr-style naming (see kroma_module_sdk::ports::naming), so the
//! regular scan/enrich/pipeline takes over. Hardlink first (the torrent keeps
//! seeding from its download folder for free), copy across filesystems.

use std::path::{Path, PathBuf};

use anyhow::{anyhow, bail, Result};

use kroma_module_sdk::engine::model::RequestKind;
use kroma_module_sdk::engine::services::jobs::now_ms;
use kroma_module_sdk::host::{HostCtx, LibraryFolders};
use kroma_module_sdk::db as db;
use kroma_module_sdk::ports::naming;
use kroma_module_sdk::ports::DownloadRow;

struct ImportMeta {
    kind: RequestKind,
    title: String,
    year: Option<u32>,
    tmdb_id: Option<u64>,
}

#[derive(Debug, Default)]
pub struct ImportSummary {
    pub imported: usize,
    pub files: usize,
    pub failed: usize,
}

fn finalize_import<S: HostCtx>(state: &S, row: &DownloadRow, written: &[String]) {
    if let Some(req_id) = row.request_id.as_deref() {
        if let Err(e) = kroma_module_sdk::engine::services::requests::on_download_imported(state, req_id) {
            tracing::warn!(request = %req_id, error = %format!("{e:#}"), "post-import request update failed");
        }
    }
    if row.tmdb_id != 0 {
        record_file_tmdb(state, row.tmdb_id, written);
    }
    if state.setting_bool("acqDeleteAfterImport", false) {
        crate::downloads(state).drop_data(state, row);
    }
}

fn record_file_tmdb<S: HostCtx>(state: &S, tmdb_id: u64, written: &[String]) {
    for path in written {
        // Keyed by canonical path to match the scanner's `files.abs_path`, so the
        // enrichment join lines up regardless of title-parse differences.
        let key = std::fs::canonicalize(path)
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| path.clone());
        if let Err(e) = db::set_file_tmdb(state.db(), &key, tmdb_id) {
            tracing::debug!(path = %key, error = %format!("{e:#}"), "could not record file tmdbId");
        }
    }
}

/// Import every `completed` download. Failures land on the row's `error`
/// (visible in the queue) without blocking the others.
pub fn import_pass<S: HostCtx>(state: &S, log: &dyn Fn(String)) -> Result<ImportSummary> {
    let ready = crate::download_db(state).completed_downloads(state)?;
    let mut summary = ImportSummary::default();
    for row in ready {
        match import_one(state, &row) {
            Ok(paths) => {
                log(format!("imported \"{}\" ({} files)", row.release_title, paths.len()));
                summary.imported += 1;
                summary.files += paths.len();
                crate::download_db(state).mark_download_imported(state, &row.id, &paths, now_ms())?;
                finalize_import(state, &row, &paths);
            }
            Err(e) => {
                log(format!("import failed for \"{}\": {e:#}", row.release_title));
                summary.failed += 1;
                crate::download_db(state).set_download_status(
                    state,
                    &row.id,
                    "completed",
                    Some(&format!("import: {e:#}")),
                )?;
            }
        }
    }
    if summary.imported > 0 {
        state.trigger_job("library.scan", "acquisition-import");
    }
    Ok(summary)
}

fn import_one<S: HostCtx>(state: &S, row: &DownloadRow) -> Result<Vec<String>> {
    let meta = resolve_meta(state, row)?;

    let save_path = row
        .save_path
        .as_deref()
        .ok_or_else(|| anyhow!("download folder unknown (external client did not report it)"))?;
    let videos = video_files(Path::new(save_path))?;
    if videos.is_empty() {
        bail!("no video file found under {save_path}");
    }

    let lib_root = target_library_root(state, meta.kind)?;
    let tpl = naming::NamingTemplates::from_host(state);
    let mut written: Vec<String> = Vec::new();
    match row.kind.as_str() {
        "movie" => {
            let src = largest(&videos);
            let ctx = movie_ctx(&meta, src);
            let dest = lib_root.join(tpl.movie_rel_path(&ctx, ext_of(src)));
            place(src, &dest)?;
            written.push(dest.to_string_lossy().into_owned());
        }
        "episode" => {
            let src = largest(&videos);
            let parsed = kroma_module_sdk::scene::parse_release_name(stem_of(src));
            let episode = row
                .episodes
                .as_ref()
                .and_then(|e| e.first().copied())
                .or(parsed.episode)
                .ok_or_else(|| anyhow!("could not determine the episode number"))?;
            let season = row.season.or(parsed.season).unwrap_or(1);
            let ctx = episode_ctx(&meta, season, episode, &parsed);
            let dest = lib_root.join(tpl.episode_rel_path(&ctx, ext_of(src)));
            place(src, &dest)?;
            written.push(dest.to_string_lossy().into_owned());
        }
        "season" => {
            let season = row.season.unwrap_or(1);
            for src in &videos {
                let parsed = kroma_module_sdk::scene::parse_release_name(stem_of(src));
                let Some(episode) = parsed.episode else {
                    tracing::debug!(file = %src.display(), "season pack: no episode marker, skipped");
                    continue;
                };
                let ctx = episode_ctx(&meta, parsed.season.unwrap_or(season), episode, &parsed);
                let dest = lib_root.join(tpl.episode_rel_path(&ctx, ext_of(src)));
                place(src, &dest)?;
                written.push(dest.to_string_lossy().into_owned());
            }
            if written.is_empty() {
                bail!("season pack had no files with parsable episode numbers");
            }
        }
        other => bail!("unknown download kind {other:?}"),
    }
    Ok(written)
}

fn movie_ctx(meta: &ImportMeta, src: &Path) -> naming::NameContext {
    let parsed = kroma_module_sdk::scene::parse_release_name(stem_of(src));
    let ctx = base_ctx(meta, &parsed);
    naming::NameContext { title: meta.title.clone(), year: meta.year, ..ctx }
}

fn episode_ctx(
    meta: &ImportMeta,
    season: u32,
    episode: u32,
    parsed: &kroma_module_sdk::scene::ParsedRelease,
) -> naming::NameContext {
    let ctx = base_ctx(meta, parsed);
    naming::NameContext {
        title: meta.title.clone(),
        year: meta.year,
        season: Some(season),
        episode: Some(episode),
        ..ctx
    }
}

fn base_ctx(meta: &ImportMeta, parsed: &kroma_module_sdk::scene::ParsedRelease) -> naming::NameContext {
    let (resolution, codec, source) = naming::quality_from_parsed(parsed);
    naming::NameContext {
        resolution,
        codec,
        source,
        proper: parsed.proper,
        repack: parsed.repack,
        release_group: parsed.group.clone(),
        dynamic_range: naming::dynamic_range(parsed.hdr, parsed.dolby_vision),
        tmdb_id: meta.tmdb_id,
        ..Default::default()
    }
}

fn ext_of(path: &Path) -> &str {
    path.extension().and_then(|e| e.to_str()).unwrap_or("mkv")
}

fn resolve_meta<S: HostCtx>(state: &S, row: &DownloadRow) -> Result<ImportMeta> {
    let kind = if row.kind == "movie" { RequestKind::Movie } else { RequestKind::Show };
    let tmdb_id = (row.tmdb_id != 0).then_some(row.tmdb_id);

    if let Some(rid) = row.request_id.as_deref() {
        let conn = state.db().get()?;
        if let Some(req) = db::get_request(&conn, rid)? {
            return Ok(ImportMeta { kind: req.kind, title: req.title, year: req.year, tmdb_id });
        }
    }
    if let Some(title) = row.title.as_deref().filter(|t| !t.trim().is_empty()) {
        return Ok(ImportMeta { kind, title: title.to_string(), year: row.year, tmdb_id });
    }
    // Last resort: derive from the release name (bare magnet with no metadata).
    let parsed = kroma_module_sdk::scene::parse_release_name(&row.release_title);
    if parsed.title.trim().is_empty() {
        bail!("could not determine a title to import under (no request, no metadata, unparseable name)");
    }
    Ok(ImportMeta { kind, title: parsed.title, year: parsed.year, tmdb_id })
}

fn stem_of(path: &Path) -> &str {
    path.file_stem().and_then(|s| s.to_str()).unwrap_or_default()
}

fn target_library_root<S: HostCtx>(state: &S, kind: RequestKind) -> Result<PathBuf> {
    let def = target_library_def(state, kind)?;
    let folder = def.folders.first().ok_or_else(|| anyhow!("library {} has no folder", def.name))?;
    Ok(PathBuf::from(folder))
}

fn target_library_def<S: HostCtx>(state: &S, kind: RequestKind) -> Result<LibraryFolders> {
    let defs = state.library_folders();
    if defs.is_empty() {
        bail!("no library configured");
    }
    let (setting, wanted_kind) = match kind {
        RequestKind::Movie => ("acqMovieLibrary", "movies"),
        RequestKind::Show => ("acqSeriesLibrary", "shows"),
    };
    let preferred = state.setting_str(setting, "Auto");
    let def: &LibraryFolders = defs
        .iter()
        .find(|d| preferred != "Auto" && !preferred.is_empty() && d.name == preferred)
        .or_else(|| defs.iter().find(|d| d.kind == wanted_kind))
        .or_else(|| defs.first())
        .ok_or_else(|| anyhow!("no library configured"))?;
    Ok(def.clone())
}

fn place(src: &Path, dest: &Path) -> Result<()> {
    if dest.exists() {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if std::fs::hard_link(src, dest).is_ok() {
        return Ok(());
    }
    // Reflink (FICLONE): a copy-on-write clone across subvolumes of one Btrfs/XFS
    // filesystem — the Synology case, where hard link fails and DSM's old kernel
    // won't reflink through std::fs::copy.
    #[cfg(target_os = "linux")]
    if try_reflink(src, dest).is_ok() {
        return Ok(());
    }
    std::fs::copy(src, dest)?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn try_reflink(src: &Path, dest: &Path) -> std::io::Result<()> {
    let src_f = std::fs::File::open(src)?;
    let dest_f = std::fs::File::create(dest)?;
    match rustix::fs::ioctl_ficlone(&dest_f, &src_f) {
        Ok(()) => Ok(()),
        Err(e) => {
            drop(dest_f);
            // Clean up so the caller's copy fallback starts from a fresh destination.
            let _ = std::fs::remove_file(dest);
            Err(e.into())
        }
    }
}

fn video_files(root: &Path) -> Result<Vec<PathBuf>> {
    let mut out = Vec::new();
    for entry in walkdir::WalkDir::new(root).max_depth(6).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.into_path();
        let ext_ok = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| kroma_module_sdk::engine::services::scan::walk::VIDEO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
            .unwrap_or(false);
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_ascii_lowercase();
        if ext_ok && !name.contains("sample") {
            out.push(path);
        }
    }
    Ok(out)
}

fn largest(files: &[PathBuf]) -> &Path {
    files
        .iter()
        .max_by_key(|p| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0))
        .expect("caller checked non-empty")
}
