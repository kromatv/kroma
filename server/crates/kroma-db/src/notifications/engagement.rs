//! What a reader did with a row beyond reading it: saw it in the panel, pressed
//! one of its actions, or put it away.

use anyhow::Result;
use rusqlite::params;

use super::stored::{row_to_notification, NOTIFICATION_COLS};
use super::{Connection, StoredNotification};
use crate::{Pool, IN_CHUNK};

/// Mark every row the reader has not seen yet as seen, the archived ones aside:
/// opening the panel is seeing all of it. Returns how many rows moved.
pub fn mark_seen(conn: &Connection, user_id: &str, now_ms: i64) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE notifications SET seen_at = ?2 \
         WHERE user_id = ?1 AND seen_at IS NULL AND archived_at IS NULL",
        params![user_id, now_ms],
    )
}

/// Record the first time the reader pressed one of a row's actions. Scoped to
/// `user_id` like every other transition. Returns whether the row moved.
pub fn mark_interacted(
    conn: &Connection,
    user_id: &str,
    id: &str,
    now_ms: i64,
) -> rusqlite::Result<bool> {
    let moved = conn.execute(
        "UPDATE notifications SET interacted_at = ?3 \
         WHERE user_id = ?1 AND id = ?2 AND interacted_at IS NULL",
        params![user_id, id, now_ms],
    )?;
    Ok(moved > 0)
}

/// Put some of a reader's rows away (`Some(now)`) or bring them back (`None`).
/// Archive replaces delete: the row leaves the inbox and the badge, and is
/// pruned before any other. Returns how many rows changed side.
pub fn set_archived(
    pool: &Pool,
    user_id: &str,
    ids: &[String],
    archived_at: Option<i64>,
) -> Result<usize> {
    if ids.is_empty() {
        return Ok(0);
    }
    let side = if archived_at.is_some() {
        "archived_at IS NULL"
    } else {
        "archived_at IS NOT NULL"
    };
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    let mut changed = 0;
    for chunk in ids.chunks(IN_CHUNK) {
        let placeholders = vec!["?"; chunk.len()].join(",");
        let sql = format!(
            "UPDATE notifications SET archived_at = ? WHERE user_id = ? AND {side} \
             AND id IN ({placeholders})"
        );
        let mut args: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(chunk.len() + 2);
        args.push(&archived_at);
        args.push(&user_id);
        for id in chunk {
            args.push(id);
        }
        changed += tx.execute(&sql, args.as_slice())?;
    }
    tx.commit()?;
    Ok(changed)
}

/// Put away every row the reader has already read: the panel's "archive what I
/// have read". Returns how many rows moved.
pub fn archive_read(conn: &Connection, user_id: &str, now_ms: i64) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE notifications SET archived_at = ?2 \
         WHERE user_id = ?1 AND read_at IS NOT NULL AND archived_at IS NULL",
        params![user_id, now_ms],
    )
}

/// One reader's archived rows, most recently active first.
pub fn list_archived(
    conn: &Connection,
    user_id: &str,
    limit: usize,
) -> rusqlite::Result<Vec<StoredNotification>> {
    let sql = format!(
        "SELECT {NOTIFICATION_COLS} FROM notifications \
         WHERE user_id = ?1 AND archived_at IS NOT NULL \
         ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ?2"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![user_id, limit as i64], row_to_notification)?;
    rows.collect()
}

/// The bell badge: rows the reader has not seen, the archived ones aside.
pub fn unseen_count(conn: &Connection, user_id: &str) -> rusqlite::Result<u32> {
    conn.query_row(
        "SELECT COUNT(*) FROM notifications \
         WHERE user_id = ?1 AND seen_at IS NULL AND archived_at IS NULL",
        params![user_id],
        |r| r.get(0),
    )
}

#[cfg(test)]
mod tests;
