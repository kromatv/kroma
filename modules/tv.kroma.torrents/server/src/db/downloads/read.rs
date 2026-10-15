use rusqlite::{params, Connection};

use super::{row_to_download, DownloadRow, DL_COLS};

/// Every download newest-first.
pub fn list_downloads(conn: &Connection, limit: usize) -> rusqlite::Result<Vec<DownloadRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {DL_COLS} FROM downloads ORDER BY grabbed_at DESC LIMIT ?1"
    ))?;
    let rows = stmt.query_map(params![limit as i64], row_to_download)?;
    rows.collect()
}

pub fn get_download(conn: &Connection, id: &str) -> rusqlite::Result<Option<DownloadRow>> {
    let mut stmt = conn.prepare(&format!("SELECT {DL_COLS} FROM downloads WHERE id = ?1"))?;
    let mut rows = stmt.query_map(params![id], row_to_download)?;
    rows.next().transpose()
}

/// Rows the monitor polls: everything not terminal.
pub fn active_downloads(conn: &Connection) -> rusqlite::Result<Vec<DownloadRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {DL_COLS} FROM downloads \
         WHERE status IN ('queued', 'downloading', 'seeding', 'paused') ORDER BY grabbed_at"
    ))?;
    let rows = stmt.query_map([], row_to_download)?;
    rows.collect()
}

/// An existing non-terminal download of the same torrent (same magnet/URL), so
/// a re-grab doesn't create a duplicate. `failed`/`removed` rows don't count -
/// those are retryable.
pub fn active_download_by_url(
    conn: &Connection,
    url: &str,
) -> rusqlite::Result<Option<DownloadRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {DL_COLS} FROM downloads \
         WHERE magnet_or_url = ?1 AND status NOT IN ('failed', 'removed') LIMIT 1"
    ))?;
    let mut rows = stmt.query_map(params![url], row_to_download)?;
    rows.next().transpose()
}

/// Another non-terminal download already running this exact torrent (same
/// engine ref / info-hash) - catches the same content grabbed from a different
/// URL, which the URL check can't see. Excludes the row being activated.
pub fn other_active_download_with_ref(
    conn: &Connection,
    exclude_id: &str,
    client_ref: &str,
) -> rusqlite::Result<Option<DownloadRow>> {
    if client_ref.is_empty() {
        return Ok(None);
    }
    let mut stmt = conn.prepare(&format!(
        "SELECT {DL_COLS} FROM downloads \
         WHERE client_ref = ?1 AND id != ?2 AND status NOT IN ('failed', 'removed') LIMIT 1"
    ))?;
    let mut rows = stmt.query_map(params![client_ref, exclude_id], row_to_download)?;
    rows.next().transpose()
}

/// Every download of one title that a client still holds, newest first: queued,
/// running, finished or paused. A failed, removed or imported one is not live.
pub fn live_downloads_for_title(
    conn: &Connection,
    tmdb_id: u64,
    client_id: &str,
) -> rusqlite::Result<Vec<DownloadRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {DL_COLS} FROM downloads \
         WHERE tmdb_id = ?1 AND client_id = ?2 \
         AND status IN ('queued', 'downloading', 'seeding', 'completed', 'paused') \
         ORDER BY grabbed_at DESC"
    ))?;
    let rows = stmt.query_map(params![tmdb_id as i64, client_id], row_to_download)?;
    rows.collect()
}

/// What the ledger alone can say about one row answering for `kind` and the
/// episode asked for: a pack was grabbed for a season, so whether it holds one
/// episode is its files' answer and not the ledger's.
#[derive(Debug, PartialEq, Eq)]
pub enum Covers {
    Yes,
    No,
    IfItsFilesHold(u32),
}

pub fn covers(row: &DownloadRow, kind: &str, episode: Option<(u32, u32)>) -> Covers {
    let Some((season, episode)) = episode else {
        return match row.kind == kind {
            true => Covers::Yes,
            false => Covers::No,
        };
    };
    if row.season != Some(season) {
        return Covers::No;
    }
    match row.kind.as_str() {
        "season" => Covers::IfItsFilesHold(episode),
        "episode"
            if row
                .episodes
                .as_ref()
                .is_some_and(|all| all.contains(&episode)) =>
        {
            Covers::Yes
        }
        _ => Covers::No,
    }
}

/// Completed rows awaiting import.
pub fn completed_downloads(conn: &Connection) -> rusqlite::Result<Vec<DownloadRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {DL_COLS} FROM downloads WHERE status = 'completed'"
    ))?;
    let rows = stmt.query_map([], row_to_download)?;
    rows.collect()
}

pub struct ActiveDownload {
    pub request_id: String,
    pub importing: bool,
    pub progress: f64,
}

/// Requests with a live grab, for deriving the transient `downloading` /
/// `importing` status + progress in list views.
pub fn requests_with_active_downloads(conn: &Connection) -> rusqlite::Result<Vec<ActiveDownload>> {
    let mut stmt = conn.prepare(
        "SELECT request_id, MAX(status = 'completed'), AVG(progress) FROM downloads \
         WHERE request_id IS NOT NULL AND status IN ('queued', 'downloading', 'seeding', 'completed', 'paused') \
         GROUP BY request_id",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(ActiveDownload {
            request_id: r.get::<_, String>(0)?,
            importing: r.get::<_, i64>(1)? != 0,
            progress: r.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests;
