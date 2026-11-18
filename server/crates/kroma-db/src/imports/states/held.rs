//! The watch state an import holds for a file no title has yet, by the path a
//! scan writes for that file. It is merged like any other, so two states held
//! for one account and one file leave the newer of each part.

use kroma_domain::watching::{Resume, Watching};
use rusqlite::{params, Connection, OptionalExtension, Row};

use super::here::merge_into_title;
use super::Merged;
use crate::Result;

const STATE_COLS: &str = "watched_at, position_ms, duration_ms, resumed_at, listed";

fn row_to_state(r: &Row, from: usize) -> rusqlite::Result<Watching> {
    let position_ms: Option<i64> = r.get(from + 1)?;
    let resumed_at: Option<i64> = r.get(from + 3)?;
    let resume = match position_ms {
        Some(position_ms) => Some(Resume {
            position_ms,
            duration_ms: r.get(from + 2)?,
            at: resumed_at.unwrap_or(0),
        }),
        None => None,
    };
    Ok(Watching {
        watched_at: r.get(from)?,
        resume,
        listed: r.get(from + 4)?,
    })
}

fn held(conn: &Connection, account: &str, path: &str) -> rusqlite::Result<Option<Watching>> {
    conn.query_row(
        &format!(
            "SELECT {STATE_COLS} FROM import_held_states WHERE abs_path = ?1 AND user_id = ?2"
        ),
        params![path, account],
        |r| row_to_state(r, 0),
    )
    .optional()
}

pub(super) fn hold(
    conn: &Connection,
    account: &str,
    path: &str,
    brought: &Watching,
) -> Result<Merged> {
    let holding = held(conn, account, path)?.unwrap_or_default();
    let gain = holding.gain_from(brought);
    if gain.is_empty() {
        return Ok(Merged::Unchanged);
    }
    let kept = holding.with(&gain);
    conn.execute(
        &format!(
            "INSERT INTO import_held_states (abs_path, user_id, {STATE_COLS}) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
             ON CONFLICT(abs_path, user_id) DO UPDATE SET \
               watched_at = excluded.watched_at, position_ms = excluded.position_ms, \
               duration_ms = excluded.duration_ms, resumed_at = excluded.resumed_at, \
               listed = excluded.listed"
        ),
        params![
            path,
            account,
            kept.watched_at,
            kept.resume.map(|resume| resume.position_ms),
            kept.resume.and_then(|resume| resume.duration_ms),
            kept.resume.map(|resume| resume.at),
            kept.listed
        ],
    )?;
    Ok(Merged::Changed)
}

struct Reached {
    path: String,
    account: String,
    item: String,
    state: Watching,
}

fn reached(conn: &Connection) -> rusqlite::Result<Vec<Reached>> {
    let mut stmt = conn.prepare(
        "SELECT h.abs_path, h.user_id, f.item_id, \
                h.watched_at, h.position_ms, h.duration_ms, h.resumed_at, h.listed \
         FROM import_held_states h JOIN files f ON f.abs_path = h.abs_path",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Reached {
            path: r.get(0)?,
            account: r.get(1)?,
            item: r.get(2)?,
            state: row_to_state(r, 3)?,
        })
    })?;
    rows.collect()
}

/// Merges every held state whose file a title now has into what its account
/// holds for that title, and stops holding it. Returns how many there were.
///
/// A scan calls it in the transaction that writes its files, so a state shows
/// on its title as soon as the scan reaches the file.
pub(crate) fn release(conn: &Connection) -> Result<usize> {
    let reached = reached(conn)?;
    for held in &reached {
        merge_into_title(conn, &held.account, &held.item, &held.state)?;
        conn.execute(
            "DELETE FROM import_held_states WHERE abs_path = ?1 AND user_id = ?2",
            params![held.path, held.account],
        )?;
    }
    Ok(reached.len())
}
