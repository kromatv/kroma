//! The `requests` table: a title someone asked for, and its lifecycle.
//!
//! The ledger a request expands into lives in [`wanted`], read back as a
//! calendar in [`calendar`], beside the [`gaps`] a library scan finds; [`search_queue`]
//! decides which of those rows a search pass takes next, and [`availability`]
//! answers what the library already holds. All re-exported flat here so the
//! public `db::<item>` paths resolve unchanged.

use rusqlite::OptionalExtension;

use super::*;
use kroma_domain::{EpisodeRef, MediaRequest, RequestKind, RequestStatus};

mod availability;
mod calendar;
mod gaps;
mod search_queue;
mod wanted;

#[cfg(test)]
mod tests;

pub use availability::*;
pub use calendar::*;
pub use gaps::*;
pub use search_queue::*;
pub use wanted::*;

// New columns must be appended, never inserted: callers read rows by position.
const REQUEST_COLS: &str = "r.id, r.kind, r.tmdb_id, r.title, r.year, r.poster_url, r.seasons, \
    r.status, r.requested_by, u.username, r.reviewed_by, r.note, r.created_at, r.updated_at, \
    r.episodes, r.air_status, r.next_air_date, r.last_refresh_at";

fn row_to_request(r: &Row) -> rusqlite::Result<MediaRequest> {
    let kind: String = r.get(1)?;
    let seasons_json: Option<String> = r.get(6)?;
    let status: String = r.get(7)?;
    let episodes_json: Option<String> = r.get(14)?;
    Ok(MediaRequest {
        id: r.get(0)?,
        kind: RequestKind::parse(&kind).unwrap_or(RequestKind::Movie),
        tmdb_id: r.get::<_, i64>(2)? as u64,
        title: r.get(3)?,
        year: r.get(4)?,
        poster_url: r.get(5)?,
        seasons: seasons_json.and_then(|j| serde_json::from_str(&j).ok()),
        episodes: episodes_json.and_then(|j| serde_json::from_str(&j).ok()),
        status: RequestStatus::parse(&status).unwrap_or(RequestStatus::Pending),
        requested_by: r.get(8)?,
        requested_by_name: r.get(9)?,
        reviewed_by: r.get(10)?,
        note: r.get(11)?,
        created_at: r.get(12)?,
        updated_at: r.get(13)?,
        progress: None,
        air_status: r.get(15)?,
        next_air_date: r.get(16)?,
        last_refresh_at: r.get(17)?,
    })
}

pub struct NewRequest {
    pub id: String,
    pub kind: RequestKind,
    pub tmdb_id: u64,
    pub title: String,
    pub year: Option<u32>,
    pub poster_url: Option<String>,
    pub seasons: Option<Vec<u32>>,
    pub episodes: Option<Vec<EpisodeRef>>,
    pub status: RequestStatus,
    pub requested_by: Option<String>,
}

pub fn insert_request(pool: &Pool, req: &NewRequest, now_ms: i64) -> Result<()> {
    let conn = pool.get()?;
    let seasons = req
        .seasons
        .as_ref()
        .map(|s| serde_json::to_string(s).unwrap_or_default());
    let episodes = req
        .episodes
        .as_ref()
        .map(|e| serde_json::to_string(e).unwrap_or_default());
    conn.execute(
        "INSERT INTO requests (id, kind, tmdb_id, title, year, poster_url, seasons, status, requested_by, episodes, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
        params![
            req.id,
            req.kind.as_str(),
            req.tmdb_id as i64,
            req.title,
            req.year,
            req.poster_url,
            seasons,
            req.status.as_str(),
            req.requested_by,
            episodes,
            now_ms
        ],
    )?;
    Ok(())
}

/// All requests newest-first, optionally scoped to one requester.
pub fn list_requests(
    conn: &Connection,
    only_user: Option<&str>,
) -> rusqlite::Result<Vec<MediaRequest>> {
    let base =
        format!("SELECT {REQUEST_COLS} FROM requests r LEFT JOIN users u ON u.id = r.requested_by");
    match only_user {
        Some(uid) => {
            let mut stmt = conn.prepare(&format!(
                "{base} WHERE r.requested_by = ?1 ORDER BY r.created_at DESC"
            ))?;
            let rows = stmt.query_map(params![uid], row_to_request)?;
            rows.collect()
        }
        None => {
            let mut stmt = conn.prepare(&format!("{base} ORDER BY r.created_at DESC"))?;
            let rows = stmt.query_map([], row_to_request)?;
            rows.collect()
        }
    }
}

pub fn get_request(conn: &Connection, id: &str) -> rusqlite::Result<Option<MediaRequest>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {REQUEST_COLS} FROM requests r LEFT JOIN users u ON u.id = r.requested_by WHERE r.id = ?1"
    ))?;
    let mut rows = stmt.query_map(params![id], row_to_request)?;
    rows.next().transpose()
}

/// The open (mergeable) request for a title, if any. Denied/failed and
/// fully-available requests are not merge targets.
pub fn find_open_request(
    conn: &Connection,
    kind: RequestKind,
    tmdb_id: u64,
) -> rusqlite::Result<Option<MediaRequest>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {REQUEST_COLS} FROM requests r LEFT JOIN users u ON u.id = r.requested_by \
         WHERE r.kind = ?1 AND r.tmdb_id = ?2 \
           AND r.status IN ('pending', 'approved', 'partially_available') \
         ORDER BY r.created_at DESC LIMIT 1"
    ))?;
    let mut rows = stmt.query_map(params![kind.as_str(), tmdb_id as i64], row_to_request)?;
    rows.next().transpose()
}

pub fn latest_request_for(
    conn: &Connection,
    kind: RequestKind,
    tmdb_id: u64,
) -> rusqlite::Result<Option<(String, RequestStatus)>> {
    conn.query_row(
        "SELECT id, status FROM requests WHERE kind = ?1 AND tmdb_id = ?2 \
         ORDER BY created_at DESC LIMIT 1",
        params![kind.as_str(), tmdb_id as i64],
        |r| {
            let status: String = r.get(1)?;
            Ok((
                r.get(0)?,
                RequestStatus::parse(&status).unwrap_or(RequestStatus::Pending),
            ))
        },
    )
    .optional()
}

pub fn set_request_status(
    pool: &Pool,
    id: &str,
    status: RequestStatus,
    reviewed_by: Option<&str>,
    note: Option<&str>,
    now_ms: i64,
) -> Result<bool> {
    let conn = pool.get()?;
    let n = conn.execute(
        "UPDATE requests SET status = ?2, \
         reviewed_by = COALESCE(?3, reviewed_by), note = COALESCE(?4, note), updated_at = ?5 \
         WHERE id = ?1",
        params![id, status.as_str(), reviewed_by, note, now_ms],
    )?;
    Ok(n > 0)
}

/// `None` = the whole show.
pub fn set_request_seasons(
    pool: &Pool,
    id: &str,
    seasons: Option<&[u32]>,
    now_ms: i64,
) -> Result<()> {
    let conn = pool.get()?;
    let json = seasons.map(|s| serde_json::to_string(s).unwrap_or_default());
    conn.execute(
        "UPDATE requests SET seasons = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, json, now_ms],
    )?;
    Ok(())
}

/// `None` = no per-episode ask.
pub fn set_request_episodes(
    pool: &Pool,
    id: &str,
    episodes: Option<&[EpisodeRef]>,
    now_ms: i64,
) -> Result<()> {
    let conn = pool.get()?;
    let json = episodes.map(|e| serde_json::to_string(e).unwrap_or_default());
    conn.execute(
        "UPDATE requests SET episodes = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, json, now_ms],
    )?;
    Ok(())
}

/// Set outright, not COALESCE'd: an ended show clearing `next_air_date` back to
/// NULL is a meaningful update. Leaves `updated_at` alone — a background sync is
/// not a lifecycle change.
pub fn set_request_air(
    pool: &Pool,
    id: &str,
    air_status: Option<&str>,
    next_air_date: Option<&str>,
    refreshed_at: i64,
) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE requests SET air_status = ?2, next_air_date = ?3, last_refresh_at = ?4 WHERE id = ?1",
        params![id, air_status, next_air_date, refreshed_at],
    )?;
    Ok(())
}

/// Cascades its wanted rows. False when absent.
pub fn delete_request(pool: &Pool, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    Ok(conn.execute("DELETE FROM requests WHERE id = ?1", params![id])? > 0)
}
