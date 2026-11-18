//! The watch-state writes, each stamped with the time its caller gives. A
//! player's write gives the time it is made at, and an import gives the time
//! the other server recorded.

use rusqlite::{params, Connection};

pub(crate) struct Stopped<'a> {
    pub position_ms: i64,
    pub duration_ms: Option<i64>,
    pub updated_at: &'a str,
}

pub(crate) fn write_progress(
    conn: &Connection,
    user_id: &str,
    item_id: &str,
    stopped: &Stopped<'_>,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO progress (user_id,item_id,position_ms,duration_ms,updated_at) \
         VALUES (?1,?2,?3,?4,?5) \
         ON CONFLICT(user_id,item_id) DO UPDATE SET \
            position_ms=excluded.position_ms, duration_ms=excluded.duration_ms, \
            updated_at=excluded.updated_at",
        params![
            user_id,
            item_id,
            stopped.position_ms,
            stopped.duration_ms,
            stopped.updated_at
        ],
    )?;
    Ok(())
}

pub(crate) fn write_watched(
    conn: &Connection,
    user_id: &str,
    item_id: &str,
    watched_at: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO watched (user_id,item_id,watched_at) VALUES (?1,?2,?3) \
         ON CONFLICT(user_id,item_id) DO UPDATE SET watched_at=excluded.watched_at",
        params![user_id, item_id, watched_at],
    )?;
    Ok(())
}

pub(crate) fn write_listed(
    conn: &Connection,
    user_id: &str,
    item_id: &str,
    added_at: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO my_list (user_id,item_id,added_at) VALUES (?1,?2,?3) \
         ON CONFLICT(user_id,item_id) DO UPDATE SET added_at=excluded.added_at",
        params![user_id, item_id, added_at],
    )?;
    Ok(())
}
