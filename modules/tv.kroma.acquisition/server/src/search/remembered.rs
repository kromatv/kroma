//! The releases a search showed, kept where every instance of this module reads
//! them: a grab follows its search on whichever instance is free. Rows outlive a
//! restart, which only spares a grab the sweep it would otherwise have to repeat.

use anyhow::Result;
use kroma_module_sdk::db::Pool;
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::dtos::ScoredReleaseView;
use crate::search::hits::CachedRelease;

const MAX_SEARCHES: i64 = 24;

/// A release as a grab reads it back, after whatever judged it has gone.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RememberedRelease {
    pub view: ScoredReleaseView,
    pub magnet_or_url: String,
    pub tmdb_id: u64,
}

pub(crate) fn remember(store: &Pool, key: &str, releases: &[CachedRelease], now_ms: i64) -> Result<()> {
    let kept: Vec<RememberedRelease> = releases
        .iter()
        .map(|c| RememberedRelease {
            view: c.view.clone(),
            magnet_or_url: c.magnet_or_url.clone(),
            tmdb_id: c.tmdb_id,
        })
        .collect();
    let conn = store.get()?;
    conn.execute(
        "DELETE FROM search_results WHERE (SELECT COUNT(*) FROM search_results) > ?1",
        params![MAX_SEARCHES],
    )?;
    conn.execute(
        "INSERT INTO search_results (key, releases, searched_at) VALUES (?1, ?2, ?3) \
         ON CONFLICT(key) DO UPDATE SET releases = excluded.releases, searched_at = excluded.searched_at",
        params![key, serde_json::to_string(&kept)?, now_ms],
    )?;
    Ok(())
}

pub(crate) fn recall(
    store: &Pool,
    key: &str,
    guid: &str,
    indexer_id: &str,
) -> Result<Option<RememberedRelease>> {
    let conn = store.get()?;
    let kept: Option<String> = conn
        .query_row(
            "SELECT releases FROM search_results WHERE key = ?1",
            params![key],
            |r| r.get(0),
        )
        .optional()?;
    let Some(kept) = kept else {
        return Ok(None);
    };
    let releases: Vec<RememberedRelease> = serde_json::from_str(&kept)?;
    Ok(releases
        .into_iter()
        .find(|r| r.view.guid == guid && r.view.indexer_id == indexer_id))
}
