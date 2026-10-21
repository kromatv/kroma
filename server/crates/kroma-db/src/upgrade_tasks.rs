//! The ledger of one-off upgrade tasks: which have finished, and why the others
//! did not yet.

use std::collections::HashSet;

use anyhow::Result;
use rusqlite::params;

use crate::Pool;

/// The names of every task that has finished.
pub fn finished(pool: &Pool) -> Result<HashSet<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT name FROM upgrade_tasks WHERE done_at IS NOT NULL")?;
    let names = stmt
        .query_map([], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(names)
}

/// Marks `name` finished at `at` (ms), counting the attempt that did it.
pub fn record_done(pool: &Pool, name: &str, at: i64) -> Result<()> {
    pool.get()?.execute(
        "INSERT INTO upgrade_tasks (name, done_at, attempts, last_error) VALUES (?1, ?2, 1, NULL) \
         ON CONFLICT(name) DO UPDATE SET done_at = ?2, attempts = attempts + 1, last_error = NULL",
        params![name, at],
    )?;
    Ok(())
}

/// Counts a failed attempt at `name` and keeps its error for the next look.
pub fn record_failure(pool: &Pool, name: &str, error: &str) -> Result<()> {
    pool.get()?.execute(
        "INSERT INTO upgrade_tasks (name, attempts, last_error) VALUES (?1, 1, ?2) \
         ON CONFLICT(name) DO UPDATE SET attempts = attempts + 1, last_error = ?2",
        params![name, error],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_task_counts_its_failures_and_forgets_the_error_once_it_finishes() {
        let pool = crate::testing::temp_pool("upgrade-tasks");
        record_failure(&pool, "move_artwork", "disk full").unwrap();
        record_failure(&pool, "move_artwork", "still full").unwrap();

        let before = finished(&pool).unwrap();
        record_done(&pool, "move_artwork", 42).unwrap();
        let after = finished(&pool).unwrap();

        let row: (i64, Option<String>) = pool
            .get()
            .unwrap()
            .query_row(
                "SELECT attempts, last_error FROM upgrade_tasks WHERE name = 'move_artwork'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert!(before.is_empty());
        assert!(after.contains("move_artwork"));
        assert_eq!(row, (3, None));
    }
}
