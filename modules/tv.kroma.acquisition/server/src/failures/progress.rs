//! When each download last moved, so a slow one is told apart from a dead one.

use anyhow::Result;
use kroma_module_sdk::db::Pool;
use rusqlite::{OptionalExtension, params};

pub(super) fn note(pool: &Pool, id: &str, progress: f64, now_ms: i64) -> Result<i64> {
    let conn = pool.get()?;
    let seen: Option<(f64, i64)> = conn
        .query_row(
            "SELECT progress, changed_at FROM download_progress WHERE download_id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let changed_at = match seen {
        Some((was, at)) if was >= progress => return Ok(at),
        _ => now_ms,
    };
    conn.execute(
        "INSERT INTO download_progress (download_id, progress, changed_at) VALUES (?1, ?2, ?3) \
         ON CONFLICT(download_id) DO UPDATE SET progress = excluded.progress, \
             changed_at = excluded.changed_at",
        params![id, progress, changed_at],
    )?;
    Ok(changed_at)
}

pub(super) fn forget_all_but(pool: &Pool, live: &[String]) -> Result<()> {
    let conn = pool.get()?;
    let kept = serde_json::to_string(live)?;
    conn.execute(
        "DELETE FROM download_progress \
         WHERE download_id NOT IN (SELECT value FROM json_each(?1))",
        params![kept],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pool() -> kroma_module_sdk::db::testing::TempPool {
        let pool = kroma_module_sdk::db::testing::temp_pool("acq-progress");
        kroma_module_sdk::db::apply_migrations(
            &pool.get().unwrap(),
            crate::rules::schema::MIGRATIONS,
        )
        .unwrap();
        pool
    }

    #[test]
    fn the_first_sight_of_a_download_starts_its_clock_now() {
        let p = pool();

        assert_eq!(note(&p, "d1", 0.4, 5_000).unwrap(), 5_000);
    }

    #[test]
    fn a_download_that_moved_since_the_last_look_restarts_its_clock() {
        let p = pool();
        note(&p, "d1", 0.4, 5_000).unwrap();

        assert_eq!(note(&p, "d1", 0.5, 9_000).unwrap(), 9_000);
    }

    #[test]
    fn a_download_that_has_not_moved_keeps_the_clock_it_had() {
        let p = pool();
        note(&p, "d1", 0.4, 5_000).unwrap();

        assert_eq!(note(&p, "d1", 0.4, 9_000).unwrap(), 5_000);
    }

    #[test]
    fn a_download_that_went_backwards_keeps_the_clock_it_had() {
        let p = pool();
        note(&p, "d1", 0.6, 5_000).unwrap();

        assert_eq!(note(&p, "d1", 0.1, 9_000).unwrap(), 5_000);
    }

    #[test]
    fn a_download_the_ledger_dropped_loses_its_clock() {
        let p = pool();
        note(&p, "d1", 0.4, 5_000).unwrap();
        note(&p, "d2", 0.4, 5_000).unwrap();

        forget_all_but(&p, &["d2".to_string()]).unwrap();

        assert_eq!(note(&p, "d1", 0.4, 9_000).unwrap(), 9_000);
        assert_eq!(note(&p, "d2", 0.4, 9_000).unwrap(), 5_000);
    }
}
