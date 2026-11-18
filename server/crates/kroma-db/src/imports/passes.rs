//! When each pass over another server last read everything it was asked for,
//! which is where the next import of that server starts from.

use rusqlite::OptionalExtension;

use crate::{Pool, Result, params};

/// Unix seconds at which the last whole read of `pass` began. `None` when the
/// pass was never read whole.
pub fn pass_read_at(pool: &Pool, server_id: &str, pass: &str) -> Result<Option<i64>> {
    let read_at = pool
        .get()?
        .query_row(
            "SELECT read_at_secs FROM import_passes WHERE server_id = ?1 AND pass = ?2",
            params![server_id, pass],
            |r| r.get(0),
        )
        .optional()?;
    Ok(read_at)
}

/// Records that a whole read of `pass` began at `read_at`, in unix seconds.
pub fn set_pass_read_at(pool: &Pool, server_id: &str, pass: &str, read_at: i64) -> Result<()> {
    pool.get()?.execute(
        "INSERT INTO import_passes (server_id, pass, read_at_secs) VALUES (?1, ?2, ?3) \
         ON CONFLICT(server_id, pass) DO UPDATE SET read_at_secs = excluded.read_at_secs",
        params![server_id, pass, read_at],
    )?;
    Ok(())
}
