//! What a person took away from their own watch state here, by part, with the
//! time they did. An import reads it so that what it offers with an older time
//! does not bring the part back (ADMIN-200).

use kroma_domain::watching::Removed;
use rusqlite::{Connection, params};

const REMOVED: &str = "SELECT \
    (SELECT removed_at FROM watch_removals WHERE user_id = ?1 AND item_id = ?2 AND kind = 'watched'), \
    (SELECT removed_at FROM watch_removals WHERE user_id = ?1 AND item_id = ?2 AND kind = 'resume'), \
    (SELECT removed_at FROM watch_removals WHERE user_id = ?1 AND item_id = ?2 AND kind = 'listed')";

/// One part of a person's state for a title: the key its removal is kept
/// under, and the table that holds it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Part {
    key: &'static str,
    table: &'static str,
}

impl Part {
    pub(crate) const WATCHED: Self = Self {
        key: "watched",
        table: "watched",
    };
    pub(crate) const RESUME: Self = Self {
        key: "resume",
        table: "progress",
    };
    pub(crate) const LISTED: Self = Self {
        key: "listed",
        table: "my_list",
    };
}

/// Removes `part` of `user_id`'s state for `item_id`, and keeps when they did
/// when there was something to remove.
pub(crate) fn remove(
    conn: &Connection,
    (user_id, item_id): (&str, &str),
    part: Part,
) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    let removed = tx.execute(
        &format!(
            "DELETE FROM {} WHERE user_id = ?1 AND item_id = ?2",
            part.table
        ),
        params![user_id, item_id],
    )?;
    if removed > 0 {
        tx.execute(
            "INSERT INTO watch_removals (user_id,item_id,kind,removed_at) \
             VALUES (?1,?2,?3,CAST(strftime('%s','now') AS INTEGER)) \
             ON CONFLICT(user_id,item_id,kind) DO UPDATE SET removed_at=excluded.removed_at",
            params![user_id, item_id, part.key],
        )?;
    }
    tx.commit()
}

/// When `user_id` last removed each part of their state for `item_id`.
pub(crate) fn removed(
    conn: &Connection,
    user_id: &str,
    item_id: &str,
) -> rusqlite::Result<Removed> {
    conn.query_row(REMOVED, params![user_id, item_id], |r| {
        Ok(Removed {
            watched: r.get(0)?,
            resume: r.get(1)?,
            listed: r.get(2)?,
        })
    })
}
