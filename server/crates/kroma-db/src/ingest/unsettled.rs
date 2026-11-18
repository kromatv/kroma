//! The shows a walk wrote episodes for and has not ended on yet. They are kept
//! in the settings store, so a walk that stops, or a server that restarts, does
//! not hide them from the next walk that ends.

use std::collections::{BTreeSet, HashSet};

use anyhow::Result;
use rusqlite::{params, OptionalExtension};

use crate::{now_or_blank, Pool};

pub const UNSETTLED_SHOWS_KEY: &str = "scan.unsettledShows";

/// The shows whose episodes a walk wrote without reaching its end. The next
/// walk that ends reports them as changed, whatever it finds itself.
pub fn unsettled_shows(pool: &Pool) -> Result<HashSet<String>> {
    let conn = pool.get()?;
    Ok(stored(&conn)?.into_iter().collect())
}

pub(super) fn note_unsettled(tx: &rusqlite::Transaction, shows: &BTreeSet<&str>) -> Result<()> {
    let mut unsettled = stored(tx)?;
    let known = unsettled.len();
    unsettled.extend(shows.iter().map(|show| show.to_string()));
    if unsettled.len() == known {
        return Ok(());
    }
    tx.execute(
        "INSERT INTO settings (key,value,updated_at) VALUES (?1,?2,?3) \
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
        params![
            UNSETTLED_SHOWS_KEY,
            serde_json::to_string(&unsettled)?,
            now_or_blank()
        ],
    )?;
    Ok(())
}

pub(super) fn forget_unsettled(tx: &rusqlite::Transaction) -> Result<()> {
    tx.execute(
        "DELETE FROM settings WHERE key = ?1",
        params![UNSETTLED_SHOWS_KEY],
    )?;
    Ok(())
}

fn stored(conn: &rusqlite::Connection) -> Result<BTreeSet<String>> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![UNSETTLED_SHOWS_KEY],
            |r| r.get(0),
        )
        .optional()?;
    Ok(raw
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default())
}

#[cfg(test)]
mod tests;
