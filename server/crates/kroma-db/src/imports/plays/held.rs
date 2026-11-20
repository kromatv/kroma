//! The plays an import holds for a file no title has yet, by the path a scan
//! writes for that file.

use rusqlite::{params, Connection};

use super::{Added, Keyed, INTO_THE_LOG, WHO_AND_WHAT};
use crate::Result;

fn held(conn: &Connection, id: &str) -> rusqlite::Result<bool> {
    conn.prepare_cached("SELECT EXISTS (SELECT 1 FROM import_held_plays WHERE id = ?1)")?
        .query_row([id], |r| r.get(0))
}

pub(super) fn hold(conn: &Connection, row: &Keyed<'_>, path: &str) -> Result<Added> {
    if held(conn, &row.id)? {
        return Ok(Added::AlreadyHere);
    }
    let kept = conn
        .prepare_cached(
            "INSERT INTO import_held_plays (id, server_id, abs_path, user_id, played_at, duration_ms) \
             SELECT ?1, ?2, ?3, u.id, ?5, ?6 FROM users u WHERE u.id = ?4",
        )?
        .execute(params![
            row.id,
            row.server_id,
            path,
            row.play.account,
            row.play.played_at,
            row.play.duration_ms
        ])?;
    Ok(if kept == 1 { Added::New } else { Added::Gone })
}

/// Adds every held play whose file a title now has to the play log, and stops
/// holding it. Returns how many there were.
///
/// A scan calls it in the transaction that writes its files, so a play shows
/// in the log as soon as the scan reaches the file.
pub(crate) fn release(conn: &Connection) -> Result<usize> {
    conn.execute(
        &format!(
            "{INTO_THE_LOG} \
             SELECT h.id, {WHO_AND_WHAT}, h.played_at, h.played_at, \
                    COALESCE(h.duration_ms, 0), h.server_id \
             FROM import_held_plays h \
             JOIN files f ON f.abs_path = h.abs_path \
             JOIN items i ON i.id = f.item_id \
             JOIN users u ON u.id = h.user_id \
             LEFT JOIN shows s ON s.id = i.show_id \
             WHERE true ON CONFLICT(id) DO NOTHING"
        ),
        [],
    )?;
    let released = conn.execute(
        "DELETE FROM import_held_plays AS h \
         WHERE EXISTS (SELECT 1 FROM files f WHERE f.abs_path = h.abs_path)",
        [],
    )?;
    Ok(released)
}
