use rusqlite::{params, Connection};

use super::{row_to_download, DownloadRow, DL_COLS};

/// Every download newest-first (the admin queue shows queue + history in one).
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
pub fn active_download_by_url(conn: &Connection, url: &str) -> rusqlite::Result<Option<DownloadRow>> {
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

/// Completed rows awaiting import.
pub fn completed_downloads(conn: &Connection) -> rusqlite::Result<Vec<DownloadRow>> {
    let mut stmt =
        conn.prepare(&format!("SELECT {DL_COLS} FROM downloads WHERE status = 'completed'"))?;
    let rows = stmt.query_map([], row_to_download)?;
    rows.collect()
}

/// One request's live acquisition phase, derived from its download rows.
pub struct ActiveDownload {
    pub request_id: String,
    pub importing: bool,
    pub progress: f64,
}

/// Requests with a live grab, for deriving the transient `downloading` /
/// `importing` status + progress in list views straight from the relationship
/// (no denormalized status to go stale when a torrent fails or is deleted).
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
mod tests {
    use super::*;
    use super::super::write::*;
    use crate::db::test_support::{download, seed_request, test_db};

    #[test]
    fn active_completed_and_dedup_queries() {
        let pool = test_db();
        for (id, status, at) in [
            ("d_q", "queued", 10),
            ("d_d", "downloading", 20),
            ("d_s", "seeding", 30),
            ("d_p", "paused", 40),
            ("d_c", "completed", 50),
            ("d_f", "failed", 60),
            ("d_r", "removed", 70),
            ("d_i", "imported", 80),
        ] {
            insert_download(&pool, &download(id, status, at)).unwrap();
        }
        let conn = pool.get().unwrap();

        // Non-terminal set, ordered by grabbed_at ASC.
        let active: Vec<String> =
            active_downloads(&conn).unwrap().into_iter().map(|d| d.id).collect();
        assert_eq!(active, vec!["d_q".to_string(), "d_d".into(), "d_s".into(), "d_p".into()]);

        let completed: Vec<String> =
            completed_downloads(&conn).unwrap().into_iter().map(|d| d.id).collect();
        assert_eq!(completed, vec!["d_c".to_string()]);

        // by_url: a live download matches; a failed one and an unknown url do not.
        assert_eq!(
            active_download_by_url(&conn, "magnet:?xt=urn:btih:d_d").unwrap().map(|d| d.id),
            Some("d_d".to_string())
        );
        assert!(active_download_by_url(&conn, "magnet:?xt=urn:btih:d_f").unwrap().is_none());
        assert!(active_download_by_url(&conn, "magnet:?xt=urn:btih:none").unwrap().is_none());
    }

    #[test]
    fn other_active_download_with_ref_dedups_by_engine_ref() {
        let pool = test_db();
        let mut a = download("a", "downloading", 10);
        a.client_ref = "ref-a".into();
        let mut b = download("b", "downloading", 20);
        b.client_ref = "ref-a".into();
        let mut c = download("c", "failed", 30);
        c.client_ref = "ref-b".into();
        insert_download(&pool, &a).unwrap();
        insert_download(&pool, &b).unwrap();
        insert_download(&pool, &c).unwrap();

        let conn = pool.get().unwrap();
        // Another live row shares ref-a; the excluded id is itself.
        assert_eq!(
            other_active_download_with_ref(&conn, "a", "ref-a").unwrap().map(|d| d.id),
            Some("b".to_string())
        );
        // An empty ref never matches.
        assert!(other_active_download_with_ref(&conn, "a", "").unwrap().is_none());
        // A terminal (failed) row is not a live duplicate.
        assert!(other_active_download_with_ref(&conn, "x", "ref-b").unwrap().is_none());
    }

    #[test]
    fn requests_with_active_downloads_rollup() {
        let pool = test_db();
        seed_request(&pool, "req1");
        seed_request(&pool, "req2");

        // req1: one live + one completed (+ a failed row that must be ignored).
        let mut a = download("a", "downloading", 10);
        a.request_id = Some("req1".into());
        a.progress = 0.5;
        let mut b = download("b", "completed", 20);
        b.request_id = Some("req1".into());
        b.progress = 1.0;
        let mut c = download("c", "failed", 30);
        c.request_id = Some("req1".into());
        c.progress = 0.9;
        // req2: only a live row.
        let mut e = download("e", "downloading", 40);
        e.request_id = Some("req2".into());
        e.progress = 0.2;
        // Orphan (no request) never appears.
        let f = download("f", "downloading", 50);
        for d in [a, b, c, e, f] {
            insert_download(&pool, &d).unwrap();
        }

        let conn = pool.get().unwrap();
        let by_req: std::collections::HashMap<String, ActiveDownload> =
            requests_with_active_downloads(&conn)
                .unwrap()
                .into_iter()
                .map(|r| (r.request_id.clone(), r))
                .collect();
        assert_eq!(by_req.len(), 2);

        let r1 = &by_req["req1"];
        assert!(r1.importing); // MAX(status='completed') = 1
        // AVG over live+completed only (the failed row is excluded): (0.5 + 1.0)/2.
        assert!((r1.progress - 0.75).abs() < 1e-9);

        let r2 = &by_req["req2"];
        assert!(!r2.importing);
        assert!((r2.progress - 0.2).abs() < 1e-9);
    }

    #[test]
    fn deriving_request_status_from_a_missing_downloads_table_errors_rather_than_reading_as_idle() {
        let pool = test_db();
        let conn = pool.get().unwrap();
        conn.execute_batch("DROP TABLE downloads").unwrap();

        assert!(requests_with_active_downloads(&conn).is_err());
    }
}
