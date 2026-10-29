//! Rows that outlive their use, and the upkeep SQLite asks for: expired
//! credentials, pipeline work whose subject is gone, the planner's statistics
//! and the write-ahead log.

use anyhow::Result;
use rusqlite::params;

use crate::Pool;

/// What one [`tidy`] pass removed.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Tidied {
    pub sessions: usize,
    pub access_tokens: usize,
    pub pipeline_tasks: usize,
    pub deliveries: usize,
}

/// Deletes the sessions and device tokens that expired before `now` (unix
/// seconds), the pipeline tasks whose item or file no longer exists (a subject
/// that comes back is queued again by the scan that finds it), and the push
/// records past their retention.
pub fn tidy(pool: &Pool, now: i64) -> Result<Tidied> {
    let conn = pool.get()?;
    let sessions = conn.execute("DELETE FROM sessions WHERE expires_at <= ?1", params![now])?;
    let access_tokens = conn.execute(
        "DELETE FROM access_tokens WHERE expires_at <= ?1",
        params![now],
    )?;
    let pipeline_tasks = conn.execute(
        "DELETE FROM pipeline_tasks \
         WHERE (subject_kind = 'item' AND NOT EXISTS (SELECT 1 FROM items WHERE id = subject_id)) \
            OR (subject_kind = 'file' AND NOT EXISTS (SELECT 1 FROM files WHERE id = subject_id))",
        [],
    )?;
    drop(conn);
    let deliveries = crate::notification_deliveries::prune(pool, now * 1_000)?;
    Ok(Tidied {
        sessions,
        access_tokens,
        pipeline_tasks,
        deliveries,
    })
}

/// Refreshes the statistics the query planner picks indexes by, and folds the
/// write-ahead log back into the database file so it stops growing.
pub fn optimize(pool: &Pool) -> Result<()> {
    pool.get()?
        .execute_batch("PRAGMA optimize = 0x10002; PRAGMA wal_checkpoint(TRUNCATE);")?;
    Ok(())
}

#[cfg(test)]
mod tests;
