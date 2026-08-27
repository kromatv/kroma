use std::collections::BTreeMap;

use rusqlite::Connection;

use super::{row_to_download, DownloadRow, DL_COLS};

/// The whole-ledger rollup behind the filter chips and the totals cards: it is
/// deliberately NOT filtered, because a chip has to say how many rows it would
/// reveal.
#[derive(Debug, Clone, Default)]
pub struct DownloadTotals {
    pub by_status: BTreeMap<String, i64>,
    pub downloaded_bytes: u64,
    pub uploaded_bytes: u64,
}

pub fn download_totals(conn: &Connection) -> rusqlite::Result<DownloadTotals> {
    let mut stmt = conn.prepare("SELECT status, COUNT(*) FROM downloads GROUP BY status")?;
    let by_status = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?
        .collect::<rusqlite::Result<BTreeMap<String, i64>>>()?;
    let (down, up) = conn.query_row(
        "SELECT COALESCE(SUM(downloaded_bytes), 0), COALESCE(SUM(uploaded_bytes), 0) FROM downloads",
        [],
        |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)),
    )?;
    Ok(DownloadTotals {
        by_status,
        downloaded_bytes: down.max(0) as u64,
        uploaded_bytes: up.max(0) as u64,
    })
}

/// How many downloads are occupying an engine slot right now, for the
/// parallelism cap. `queued` rows are the ones waiting for one, so they do not
/// count against it.
pub fn running_download_count(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM downloads WHERE status IN ('downloading', 'seeding')",
        [],
        |r| r.get(0),
    )
}

/// Queued rows in grab order, so the slot that just freed goes to the download
/// that has been waiting longest.
pub fn queued_downloads(conn: &Connection) -> rusqlite::Result<Vec<DownloadRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {DL_COLS} FROM downloads WHERE status = 'queued' ORDER BY grabbed_at"
    ))?;
    let rows = stmt.query_map([], row_to_download)?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::super::write::*;
    use super::*;
    use crate::db::test_support::{download, seeded_ledger, test_db};

    #[test]
    fn totals_roll_up_every_status_and_both_byte_counters() {
        let pool = seeded_ledger();
        update_download_bytes(&pool, "d_s", 900, 450).unwrap();
        update_download_bytes(&pool, "d_c", 100, 50).unwrap();
        let conn = pool.get().unwrap();

        let totals = download_totals(&conn).unwrap();

        assert_eq!(totals.by_status.get("queued"), Some(&1));
        assert_eq!(totals.by_status.get("downloading"), Some(&1));
        assert_eq!(totals.downloaded_bytes, 1000);
        assert_eq!(totals.uploaded_bytes, 500);
    }

    #[test]
    fn a_queued_row_that_never_reached_an_engine_is_the_one_waiting_to_start() {
        let pool = seeded_ledger();
        let mut started = download("d_started", "queued", 5);
        started.client_ref = "already-added".into();
        insert_download(&pool, &started).unwrap();
        let conn = pool.get().unwrap();

        let waiting: Vec<String> = queued_downloads(&conn)
            .unwrap()
            .into_iter()
            .filter(|row| row.client_ref.is_empty())
            .map(|row| row.id)
            .collect();

        assert_eq!(waiting, ["d_q"]);
    }

    #[test]
    fn only_rows_holding_an_engine_slot_count_against_the_parallelism_cap() {
        let pool = seeded_ledger();
        let conn = pool.get().unwrap();

        assert_eq!(running_download_count(&conn).unwrap(), 2);
        assert_eq!(
            queued_downloads(&conn)
                .unwrap()
                .iter()
                .map(|d| d.id.as_str())
                .collect::<Vec<_>>(),
            ["d_q"]
        );
    }

    #[test]
    fn an_empty_ledger_rolls_up_to_zero_rather_than_to_nothing() {
        let pool = test_db();
        let conn = pool.get().unwrap();

        let totals = download_totals(&conn).unwrap();

        assert!(totals.by_status.is_empty());
        assert_eq!(totals.downloaded_bytes, 0);
        assert_eq!(totals.uploaded_bytes, 0);
    }
}
