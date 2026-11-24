//! The poster and the backdrop an admin chose for a title. They come before the
//! pictures kept beside its files, which come before fetched art.

use crate::art_beside::Urls;
use crate::{params, Connection, Pool, Result};

/// One picture of a title: the `kind` title `id`, and the role the picture has
/// for it.
#[derive(Debug, Clone, Copy)]
pub struct Slot<'a> {
    pub kind: &'a str,
    pub id: &'a str,
    pub role: &'a str,
}

/// Show the picture served under `url` in `slot`, in place of any chosen before.
pub fn choose(pool: &Pool, slot: Slot<'_>, url: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT OR REPLACE INTO art_chosen (subject_kind, subject_id, role, url, chosen_at) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            slot.kind,
            slot.id,
            slot.role,
            url,
            kroma_primitives::now_ms()
        ],
    )?;
    Ok(())
}

/// Hand `slot` back to the picture beside the title's files, or to fetched art.
pub fn clear(pool: &Pool, slot: Slot<'_>) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "DELETE FROM art_chosen WHERE subject_kind = ?1 AND subject_id = ?2 AND role = ?3",
        params![slot.kind, slot.id, slot.role],
    )?;
    Ok(())
}

/// What an admin chose for the `kind` title `id`.
pub fn chosen(pool: &Pool, kind: &str, id: &str) -> Result<Urls> {
    let conn = pool.get()?;
    let mut stmt = conn
        .prepare("SELECT role, url FROM art_chosen WHERE subject_kind = ?1 AND subject_id = ?2")?;
    let mut rows = stmt.query_map(params![kind, id], |r| {
        Ok((r.get::<_, String>(0)?, r.get(1)?))
    })?;
    let urls = rows.try_fold(Urls::default(), |mut urls, row| {
        let (role, url): (String, String) = row?;
        urls.set(&role, url);
        Ok::<_, rusqlite::Error>(urls)
    })?;
    Ok(urls)
}

/// The URL of every chosen picture.
pub fn urls(conn: &Connection) -> Result<Vec<String>> {
    Ok(conn
        .prepare("SELECT DISTINCT url FROM art_chosen")?
        .query_map([], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?)
}

#[cfg(test)]
mod tests;
