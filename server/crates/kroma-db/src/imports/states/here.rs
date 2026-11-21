//! What an account holds for a title of the catalogue, read as one state and
//! written with the time each part carries.

use kroma_domain::watching::{Resume, Watching};
use rusqlite::{params, Connection, Row};

use super::Merged;
use crate::playback::{
    remove_progress, removed, write_listed, write_progress, write_watched, Stopped,
};
use crate::{now_or_blank, Result};

const NEWER_THAN_ANY: i64 = i64::MAX;

const HELD_HERE: &str = "SELECT w.user_id IS NOT NULL, CAST(strftime('%s', w.watched_at) AS INTEGER), \
        p.user_id IS NOT NULL, CAST(strftime('%s', p.updated_at) AS INTEGER), \
        p.position_ms, p.duration_ms, l.user_id IS NOT NULL \
     FROM (SELECT ?1 AS user_id, ?2 AS item_id) k \
     LEFT JOIN watched w ON w.user_id = k.user_id AND w.item_id = k.item_id \
     LEFT JOIN progress p ON p.user_id = k.user_id AND p.item_id = k.item_id \
     LEFT JOIN my_list l ON l.user_id = k.user_id AND l.item_id = k.item_id";

fn stamp(r: &Row, held: usize, at: usize) -> rusqlite::Result<Option<i64>> {
    let held: bool = r.get(held)?;
    let at: Option<i64> = r.get(at)?;
    Ok(held.then(|| at.unwrap_or(NEWER_THAN_ANY)))
}

fn row_to_state(r: &Row) -> rusqlite::Result<Watching> {
    let resume = match stamp(r, 2, 3)? {
        Some(at) => Some(Resume {
            position_ms: r.get(4)?,
            duration_ms: r.get(5)?,
            at,
        }),
        None => None,
    };
    Ok(Watching {
        watched_at: stamp(r, 0, 1)?,
        resume,
        listed: r.get(6)?,
    })
}

fn held_here(conn: &Connection, account: &str, item: &str) -> rusqlite::Result<Watching> {
    conn.query_row(HELD_HERE, params![account, item], row_to_state)
}

/// One account's state on one title or show.
pub(super) struct Title<'a> {
    pub account: &'a str,
    pub item: &'a str,
}

fn write_resume(conn: &Connection, title: &Title<'_>, resume: Option<Resume>) -> Result<()> {
    let Some(resume) = resume else {
        remove_progress(conn, title.account, title.item)?;
        return Ok(());
    };
    let stopped = Stopped {
        position_ms: resume.position_ms,
        duration_ms: resume.duration_ms,
        updated_at: &kroma_primitives::iso8601_of_secs(resume.at),
    };
    write_progress(conn, title.account, title.item, &stopped)?;
    Ok(())
}

fn write(conn: &Connection, title: &Title<'_>, here: &Watching, merged: &Watching) -> Result<()> {
    let (account, item) = (title.account, title.item);
    if let Some(at) = merged.watched_at.filter(|_| merged.watched_at != here.watched_at) {
        write_watched(conn, account, item, &kroma_primitives::iso8601_of_secs(at))?;
    }
    if merged.resume != here.resume {
        write_resume(conn, title, merged.resume)?;
    }
    if merged.listed && !here.listed {
        write_listed(conn, account, item, &now_or_blank())?;
    }
    Ok(())
}

pub(super) fn exists(conn: &Connection, table: &str, id: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        &format!("SELECT EXISTS (SELECT 1 FROM {table} WHERE id = ?1)"),
        [id],
        |r| r.get(0),
    )
}

/// The table a title of the catalogue is in.
pub(super) const TITLES: &str = "items";
/// The table a show is in.
pub(super) const SHOWS: &str = "shows";

/// Merges `brought` into what `title` holds, when `table` still has it.
pub(super) fn merge_into(
    conn: &Connection,
    (table, title): (&str, &Title<'_>),
    brought: &Watching,
) -> Result<Merged> {
    if !exists(conn, table, title.item)? {
        return Ok(Merged::Gone);
    }
    let here = held_here(conn, title.account, title.item)?;
    let kept = brought.newer_than(&removed(conn, title.account, title.item)?);
    let merged = here.merged_with(&kept);
    if merged == here {
        return Ok(Merged::Unchanged);
    }
    write(conn, title, &here, &merged)?;
    Ok(Merged::Changed)
}
