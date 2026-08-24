//! Import: move completed downloads into the library with the configured
//! Sonarr/Radarr-style naming (see the `kroma-naming` library), so the
//! regular scan/enrich/pipeline takes over. Hardlink first (the torrent keeps
//! seeding from its download folder for free), copy across filesystems.

use std::path::{Path, PathBuf};

use anyhow::{anyhow, bail, Result};

use kroma_module_sdk::engine::model::RequestKind;
use kroma_module_sdk::engine::services::jobs::now_ms;
use kroma_module_sdk::host::{HostStorage, LibraryFolders};
use kroma_module_sdk::db as db;
use kroma_naming as naming;
use crate::peers::downloads::DownloadRow;

mod place;
mod replace;

use place::{ext_of, largest, place, video_files, Placement};
use replace::drop_replaced;

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

fn finalize_import<S: HostStorage>(state: &S, row: &DownloadRow, written: &[String]) {
    if let Some(req_id) = row.request_id.as_deref() {
        if let Err(e) = kroma_module_sdk::engine::services::requests::on_download_imported(state, req_id) {
            tracing::warn!(request = %req_id, error = %format!("{e:#}"), "post-import request update failed");
        }
    }
    if row.tmdb_id != 0 {
        record_file_tmdb(state, row.tmdb_id, written);
    }
    if state.setting_bool("acqDeleteAfterImport", false) {
        crate::peers::downloads::drop_data(state, &row.id);
    }
}

fn record_file_tmdb<S: HostStorage>(state: &S, tmdb_id: u64, written: &[String]) {
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
pub fn import_pass<S: HostStorage>(state: &S, log: &dyn Fn(String)) -> Result<ImportSummary> {
    let ready = crate::peers::downloads::completed(state)?;
    let mut summary = ImportSummary::default();
    for row in ready {
        match import_one(state, &row) {
            Ok(paths) => {
                log(format!("imported \"{}\" ({} files)", row.release_title, paths.len()));
                summary.imported += 1;
                summary.files += paths.len();
                crate::peers::downloads::mark_imported(state, &row.id, &paths, now_ms())?;
                finalize_import(state, &row, &paths);
            }
            Err(e) => {
                log(format!("import failed for \"{}\": {e:#}", row.release_title));
                summary.failed += 1;
                crate::peers::downloads::set_status(
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

fn import_one<S: HostStorage>(state: &S, row: &DownloadRow) -> Result<Vec<String>> {
    let meta = resolve_meta(state, row)?;

    let save_path = row
        .save_path
        .as_deref()
        .ok_or_else(|| anyhow!("download folder unknown (external client did not report it)"))?;
    let videos = video_files(Path::new(save_path))?;
    let Some(largest_video) = largest(&videos) else {
        bail!("no video file found under {save_path}");
    };

    let lib = target_library_def(state, meta.kind)?;
    let lib_root =
        PathBuf::from(lib.folders.first().ok_or_else(|| anyhow!("library {} has no folder", lib.name))?);
    let tpl = naming::NamingTemplates::read(|k, d| state.setting_str(k, d));
    let replacing = row.upgrade && state.setting_bool("acqReplaceOnUpgrade", true);
    let mode = match (row.upgrade, replacing) {
        (true, true) => Placement::Replace,
        (true, false) => Placement::Beside,
        (false, _) => Placement::Skip,
    };
    // A replaced episode is only known once its number is, and what it replaces
    // depends on where the new file landed: collect both as they are placed.
    let mut placed: Vec<(Replaced, String)> = Vec::new();
    match row.kind.as_str() {
        "movie" => {
            let ctx = movie_ctx(&meta, largest_video);
            let dest = lib_root.join(tpl.movie_rel_path(&ctx, ext_of(largest_video)));
            let at = place(largest_video, &dest, mode)?;
            placed.push((Replaced::Movie, at.to_string_lossy().into_owned()));
        }
        "episode" => {
            let parsed = kroma_scene::parse_release_name(stem_of(largest_video));
            let episode = row
                .episodes
                .as_ref()
                .and_then(|e| e.first().copied())
                .or(parsed.episode)
                .ok_or_else(|| anyhow!("could not determine the episode number"))?;
            let season = row.season.or(parsed.season).unwrap_or(1);
            let ctx = episode_ctx(&meta, season, episode, &parsed);
            let dest = lib_root.join(tpl.episode_rel_path(&ctx, ext_of(largest_video)));
            let at = place(largest_video, &dest, mode)?;
            placed.push((Replaced::Episode(season, episode), at.to_string_lossy().into_owned()));
        }
        "season" => {
            let mut skipped_other_season = 0usize;
            for src in &videos {
                let parsed = kroma_scene::parse_release_name(stem_of(src));
                let Some(episode) = parsed.episode else {
                    tracing::debug!(file = %src.display(), "season pack: no episode marker, skipped");
                    continue;
                };
                let season = parsed.season.or(row.season).unwrap_or(1);
                // A mixed or complete-series pack carries episodes the grab was
                // not for, and whose upgrade verdict was never computed.
                if row.season.is_some_and(|want| want != season) {
                    skipped_other_season += 1;
                    tracing::debug!(
                        file = %src.display(),
                        season,
                        "season pack: file from another season, skipped"
                    );
                    continue;
                }
                let ctx = episode_ctx(&meta, season, episode, &parsed);
                let dest = lib_root.join(tpl.episode_rel_path(&ctx, ext_of(src)));
                let at = place(src, &dest, mode)?;
                placed.push((Replaced::Episode(season, episode), at.to_string_lossy().into_owned()));
            }
            if placed.is_empty() {
                if skipped_other_season > 0 {
                    bail!("season pack held no episode of season {:?}", row.season);
                }
                bail!("season pack had no files with parsable episode numbers");
            }
        }
        other => bail!("unknown download kind {other:?}"),
    }
    if replacing {
        drop_replaced(state, row, &placed, &lib.id);
    }
    Ok(placed.into_iter().map(|(_, at)| at).collect())
}

// What an upgrade just improved, resolved to file paths after the new ones land.
enum Replaced {
    Movie,
    Episode(u32, u32),
}

fn movie_ctx(meta: &ImportMeta, src: &Path) -> naming::NameContext {
    let parsed = kroma_scene::parse_release_name(stem_of(src));
    let ctx = base_ctx(meta, &parsed);
    naming::NameContext { title: meta.title.clone(), year: meta.year, ..ctx }
}

fn episode_ctx(
    meta: &ImportMeta,
    season: u32,
    episode: u32,
    parsed: &kroma_scene::ParsedRelease,
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

fn base_ctx(meta: &ImportMeta, parsed: &kroma_scene::ParsedRelease) -> naming::NameContext {
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

fn resolve_meta<S: HostStorage>(state: &S, row: &DownloadRow) -> Result<ImportMeta> {
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
    let parsed = kroma_scene::parse_release_name(&row.release_title);
    if parsed.title.trim().is_empty() {
        bail!("could not determine a title to import under (no request, no metadata, unparseable name)");
    }
    Ok(ImportMeta { kind, title: parsed.title, year: parsed.year, tmdb_id })
}

fn stem_of(path: &Path) -> &str {
    path.file_stem().and_then(std::ffi::OsStr::to_str).unwrap_or_default()
}

fn target_library_def<S: HostStorage>(state: &S, kind: RequestKind) -> Result<LibraryFolders> {
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
