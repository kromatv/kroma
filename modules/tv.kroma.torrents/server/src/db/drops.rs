use anyhow::Result;
use rusqlite::{params, Connection};

use super::Pool;

/// `true` the first time a drop is owed for `id`, so a retry every monitor tick
/// does not say the same thing in the log forever.
pub fn defer_drop(pool: &Pool, id: &str) -> Result<bool> {
    let rows = pool.get()?.execute(
        "INSERT OR IGNORE INTO deferred_drops (id) VALUES (?1)",
        params![id],
    )?;
    Ok(rows > 0)
}

pub fn forget_drop(pool: &Pool, id: &str) -> Result<()> {
    pool.get()?
        .execute("DELETE FROM deferred_drops WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn deferred_drops(conn: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT id FROM deferred_drops")?;
    let ids = stmt.query_map([], |row| row.get(0))?;
    ids.collect()
}
