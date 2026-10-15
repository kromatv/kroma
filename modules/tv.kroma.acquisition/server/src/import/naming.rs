//! What a release is imported UNDER: the title, year and TMDB id it was grabbed
//! for, and the naming context the templates render a path from.

use std::path::Path;

use anyhow::{bail, Result};

use crate::peers::downloads::DownloadRow;
use kroma_module_sdk::db;
use kroma_module_sdk::engine::model::RequestKind;
use kroma_module_sdk::host::HostStorage;
use kroma_naming as naming;

pub(super) struct ImportMeta {
    pub(super) kind: RequestKind,
    pub(super) title: String,
    pub(super) year: Option<u32>,
    pub(super) tmdb_id: Option<u64>,
}

pub(super) fn movie_ctx(meta: &ImportMeta, src: &Path) -> naming::NameContext {
    let parsed = kroma_scene::parse_release_name(stem_of(src));
    let ctx = base_ctx(meta, &parsed);
    naming::NameContext {
        title: meta.title.clone(),
        year: meta.year,
        ..ctx
    }
}

pub(super) fn episode_ctx(
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

pub(super) fn resolve_meta<S: HostStorage>(state: &S, row: &DownloadRow) -> Result<ImportMeta> {
    let kind = if row.kind == "movie" {
        RequestKind::Movie
    } else {
        RequestKind::Show
    };
    let tmdb_id = (row.tmdb_id != 0).then_some(row.tmdb_id);

    if let Some(rid) = row.request_id.as_deref() {
        let conn = state.db().get()?;
        if let Some(req) = db::get_request(&conn, rid)? {
            return Ok(ImportMeta {
                kind: req.kind,
                title: req.title,
                year: req.year,
                tmdb_id,
            });
        }
    }
    if let Some(title) = row.title.as_deref().filter(|t| !t.trim().is_empty()) {
        return Ok(ImportMeta {
            kind,
            title: title.to_string(),
            year: row.year,
            tmdb_id,
        });
    }
    // Last resort: derive from the release name (bare magnet with no metadata).
    let parsed = kroma_scene::parse_release_name(&row.release_title);
    if parsed.title.trim().is_empty() {
        bail!(
            "could not determine a title to import under (no request, no metadata, unparseable name)"
        );
    }
    Ok(ImportMeta {
        kind,
        title: parsed.title,
        year: parsed.year,
        tmdb_id,
    })
}

pub(super) fn stem_of(path: &Path) -> &str {
    path.file_stem()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or_default()
}
