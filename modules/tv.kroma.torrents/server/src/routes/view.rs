//! One ledger row rendered for the admin queue.
//!
//! The names on a row come from three places the row itself does not hold: the
//! request that grabbed it, the indexer that served it, and the engine running
//! it. They are resolved once per page and handed in, because a lookup per row
//! per poll is what made the unpaged list expensive.

use std::collections::HashMap;

use rusqlite::Connection;

use crate::db::{self, DownloadRow};
use crate::downloads::LiveStat;
use crate::DownloadView;

/// The per-page lookups every row on it shares.
pub struct RowContext<'a> {
    pub indexers: &'a HashMap<String, String>,
    pub clients: &'a HashMap<String, String>,
    pub live: &'a HashMap<String, LiveStat>,
}

fn display_title(row: &DownloadRow, request_title: Option<&str>) -> String {
    request_title
        .map(str::to_string)
        .or_else(|| {
            row.title
                .as_ref()
                .filter(|t| !t.trim().is_empty())
                .cloned()
                .filter(|_| row.tmdb_id.is_some())
        })
        .unwrap_or_else(|| row.release_title.clone())
}

fn local_id(conn: &Connection, row: &DownloadRow, request_tmdb: Option<u64>) -> Option<String> {
    let tmdb = request_tmdb.or(row.tmdb_id).filter(|id| *id != 0)?;
    if row.kind == "movie" {
        db::movie_item_by_tmdb(conn, tmdb).ok().flatten()
    } else {
        db::show_by_tmdb(conn, tmdb).ok().flatten()
    }
}

pub fn to_view(conn: &Connection, ctx: &RowContext, row: DownloadRow) -> DownloadView {
    let request = row
        .request_id
        .as_deref()
        .and_then(|id| db::get_request(conn, id).ok().flatten());
    let title = display_title(&row, request.as_ref().map(|r| r.title.as_str()));
    let poster_url = request.as_ref().and_then(|r| r.poster_url.clone());
    let local_id = local_id(conn, &row, request.as_ref().map(|r| r.tmdb_id));
    let indexer_name = row
        .indexer_id
        .as_deref()
        .and_then(|id| ctx.indexers.get(id).cloned());
    let live = ctx.live.get(&row.id).copied().unwrap_or_default();
    DownloadView {
        id: row.id,
        client_name: ctx
            .clients
            .get(&row.client_id)
            .cloned()
            .unwrap_or_else(|| row.client_id.clone()),
        client_id: row.client_id,
        request_id: row.request_id,
        kind: row.kind,
        title,
        release_title: row.release_title,
        season: row.season,
        episodes: row.episodes,
        status: row.status,
        progress: row.progress,
        down_bps: live.down_bps,
        up_bps: live.up_bps,
        peers: live.peers,
        peers_seen: live.peers_seen,
        size_bytes: row.size_bytes,
        score: row.score,
        error: row.error,
        grabbed_at: row.grabbed_at,
        completed_at: row.completed_at,
        imported_at: row.imported_at,
        indexer_name,
        details_url: row.details_url,
        info_hash: row.info_hash,
        poster_url,
        local_id,
        year: row.year,
        tmdb_id: row.tmdb_id,
        match_source: row.match_source,
        lifetime_downloaded_bytes: row.lifetime_downloaded_bytes,
        lifetime_uploaded_bytes: row.lifetime_uploaded_bytes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(tmdb_id: Option<u64>, title: Option<&str>) -> DownloadRow {
        DownloadRow {
            tmdb_id,
            title: title.map(str::to_string),
            release_title: "The.Matrix.1999.1080p.BluRay-GRP".into(),
            ..blank()
        }
    }

    fn blank() -> DownloadRow {
        DownloadRow {
            id: String::new(),
            client_id: String::new(),
            client_ref: String::new(),
            request_id: None,
            kind: "movie".into(),
            tmdb_id: None,
            title: None,
            year: None,
            season: None,
            episodes: None,
            release_title: String::new(),
            indexer_id: None,
            info_hash: None,
            magnet_or_url: String::new(),
            size_bytes: None,
            score: None,
            score_breakdown: None,
            status: "queued".into(),
            progress: 0.0,
            save_path: None,
            imported_paths: None,
            error: None,
            grabbed_at: 0,
            completed_at: None,
            imported_at: None,
            details_url: None,
            only_files: None,
            upgrade: false,
            lifetime_downloaded_bytes: 0,
            lifetime_uploaded_bytes: 0,
            match_source: None,
        }
    }

    #[test]
    fn a_linked_row_shows_its_pinned_title_and_an_unlinked_one_shows_the_release() {
        let linked = row(Some(603), Some("The Matrix"));
        let orphan = row(None, Some("stale guess"));

        assert_eq!(display_title(&linked, None), "The Matrix");
        assert_eq!(display_title(&orphan, None), orphan.release_title);
    }

    #[test]
    fn the_request_title_outranks_the_rows_own() {
        let linked = row(Some(603), Some("The Matrix"));

        assert_eq!(display_title(&linked, Some("Matrix, The")), "Matrix, The");
    }
}
