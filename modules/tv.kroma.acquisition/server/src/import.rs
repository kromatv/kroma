//! Import: move completed downloads into the library with the configured
//! Sonarr/Radarr-style naming (see the `kroma-naming` library), so the
//! regular scan/enrich/pipeline takes over. Hardlink first (the torrent keeps
//! seeding from its download folder for free), copy across filesystems.

use std::path::{Path, PathBuf};

use anyhow::{anyhow, bail, Result};

use crate::peers::downloads::DownloadRow;
use kroma_module_sdk::db;
use kroma_module_sdk::engine::model::RequestKind;
use kroma_module_sdk::engine::services::jobs::now_ms;
use kroma_module_sdk::host::{HostStorage, LibraryFolders};

mod content;
mod ledger;
mod naming;
mod place;
mod recycle;
mod replace;
mod subtitles;

pub use recycle::empty_recycle_bin;

use content::{largest, Content};
use ledger::{until_it_lands, BUSY_BACKOFF};
use naming::{episode_ctx, movie_ctx, resolve_meta, stem_of};
use place::{ext_of, Placement};
use replace::drop_replaced;
use subtitles::place_with_subtitles;

#[derive(Debug, Default)]
pub struct ImportSummary {
    pub imported: usize,
    pub files: usize,
    pub failed: usize,
}

fn finalize_import<S: HostStorage>(state: &S, row: &DownloadRow, written: &[String]) {
    use kroma_module_sdk::engine::services::requests::{on_download_imported, Imported};
    if row.tmdb_id != 0 {
        let imported = Imported {
            kind: crate::auto::title_kind(&row.kind),
            tmdb_id: row.tmdb_id,
            season: row.season,
            episodes: row.episodes.as_deref(),
            request_id: row.request_id.as_deref(),
        };
        if let Err(e) = until_it_lands(&BUSY_BACKOFF, "post-import ledger update", || {
            on_download_imported(state, &imported)
        }) {
            tracing::warn!(download = %row.id, error = %format!("{e:#}"), "post-import ledger update failed");
        }
        record_file_tmdb(state, row.tmdb_id, written);
    }
    record_releases(state, &row.release_title, written);
    if state.setting_bool("acqDeleteAfterImport", false) {
        crate::peers::downloads::drop_data(state, &row.id);
    }
}

fn record_releases<S: HostStorage>(state: &S, release_title: &str, written: &[String]) {
    for path in written {
        let key = canonical(path);
        if let Err(e) = crate::rules::store::record_release(state.store(), &key, release_title, now_ms()) {
            tracing::debug!(path = %key, error = %format!("{e:#}"), "could not record the release name");
        }
    }
}

fn canonical(path: &str) -> String {
    std::fs::canonicalize(path)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| path.to_string())
}

fn record_file_tmdb<S: HostStorage>(state: &S, tmdb_id: u64, written: &[String]) {
    for path in written {
        // Keyed by canonical path to match the scanner's `files.abs_path`, so the
        // enrichment join lines up regardless of title-parse differences.
        let key = canonical(path);
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
                log(format!(
                    "imported \"{}\" ({} files)",
                    row.release_title,
                    paths.len()
                ));
                summary.imported += 1;
                summary.files += paths.len();
                let marked = until_it_lands(&BUSY_BACKOFF, "mark imported", || {
                    crate::peers::downloads::mark_imported(state, &row.id, &paths, now_ms())
                });
                if let Err(e) = marked {
                    tracing::warn!(download = %row.id, error = %format!("{e:#}"), "could not mark the download imported");
                    continue;
                }
                finalize_import(state, &row, &paths);
            }
            Err(e) => {
                log(format!(
                    "import failed for \"{}\": {e:#}",
                    row.release_title
                ));
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
    let content = Content::under(Path::new(save_path), &row.content_rel_paths);
    let videos = content.videos();
    let Some(largest_video) = largest(&videos) else {
        bail!("no video file found under {save_path}");
    };

    let lib = target_library_def(state, meta.kind)?;
    let lib_root = PathBuf::from(
        lib.folders
            .first()
            .ok_or_else(|| anyhow!("library {} has no folder", lib.name))?,
    );
    let tpl = kroma_naming::NamingTemplates::read(|k, d| state.setting_str(k, d));
    let replacing = row.upgrade
        && state.setting_bool("acqReplaceOnUpgrade", true)
        && !crate::rules::store::is_beside(state.store(), &row.id)?;
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
            let at = place_with_subtitles(state, largest_video, content.files(), &dest, mode)?;
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
            let at = place_with_subtitles(state, largest_video, content.files(), &dest, mode)?;
            placed.push((
                Replaced::Episode(season, episode),
                at.to_string_lossy().into_owned(),
            ));
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
                let at = place_with_subtitles(state, src, content.files(), &dest, mode)?;
                placed.push((
                    Replaced::Episode(season, episode),
                    at.to_string_lossy().into_owned(),
                ));
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
