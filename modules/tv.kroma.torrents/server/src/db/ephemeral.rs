use std::collections::HashSet;

use anyhow::Result;
use rusqlite::{params, Connection};

use super::Pool;

pub fn mark_ephemeral(pool: &Pool, id: &str) -> Result<()> {
    pool.get()?.execute(
        "INSERT OR IGNORE INTO ephemeral_downloads (id) VALUES (?1)",
        params![id],
    )?;
    Ok(())
}

pub fn forget_ephemeral(pool: &Pool, id: &str) -> Result<()> {
    pool.get()?
        .execute("DELETE FROM ephemeral_downloads WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn ephemeral_ids(conn: &Connection) -> rusqlite::Result<HashSet<String>> {
    let mut stmt = conn.prepare("SELECT id FROM ephemeral_downloads")?;
    let ids = stmt.query_map([], |row| row.get(0))?;
    ids.collect()
}
