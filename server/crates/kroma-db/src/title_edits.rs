//! What a person who manages the library wrote by hand about a film or a show
//! (LIB-83). It is laid over the provider's text in every language, and over
//! the catalog that search and the embeddings read.

use std::collections::HashMap;

use kroma_domain::title_edit::{Editable, TitleEdit};
use kroma_domain::{MediaItem, Show};

use crate::chunked::query_by_subject_ids;
use crate::metadata_core::{ITEM, SHOW};
use crate::{params, Connection, Pool, Result};

const KEEP: &str = "INSERT OR REPLACE INTO title_edits \
                    (subject_kind, subject_id, edit, edited_at) VALUES (?1, ?2, ?3, ?4)";
const FORGET: &str = "DELETE FROM title_edits WHERE subject_kind = ?1 AND subject_id = ?2";

/// A film (`item`) or a show (`show`), by its id.
#[derive(Debug, Clone, Copy)]
pub struct Title<'a> {
    pub kind: &'a str,
    pub id: &'a str,
}

/// Keep `edit` for `title`, in place of the one before. An edit that leaves
/// every field empty hands the title back to the provider.
pub fn write(pool: &Pool, title: Title<'_>, edit: &TitleEdit) -> Result<()> {
    let conn = pool.get()?;
    if edit.is_empty() {
        conn.execute(FORGET, params![title.kind, title.id])?;
    } else {
        let json = serde_json::to_string(edit)?;
        let at = kroma_primitives::now_ms();
        conn.execute(KEEP, params![title.kind, title.id, json, at])?;
    }
    Ok(())
}

/// What was written by hand for `title`.
pub fn written(pool: &Pool, title: Title<'_>) -> Result<TitleEdit> {
    let conn = pool.get()?;
    let mut edits = load(&conn, title.kind, &[title.id])?;
    Ok(edits.remove(title.id).unwrap_or_default())
}

pub(crate) fn load(
    conn: &Connection,
    kind: &str,
    ids: &[&str],
) -> Result<HashMap<String, TitleEdit>> {
    let rows = query_by_subject_ids(
        conn,
        kind,
        ids,
        &[],
        |ph| {
            format!(
                "SELECT subject_id, edit FROM title_edits \
                 WHERE subject_kind = ? AND subject_id IN ({ph})"
            )
        },
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    Ok(parsed(rows))
}

pub(crate) fn lay_over(
    conn: &Connection,
    items: &mut [MediaItem],
    shows: &mut [Show],
) -> Result<()> {
    onto_each(&every(conn, ITEM)?, items, |item| &item.id);
    onto_each(&every(conn, SHOW)?, shows, |show| &show.id);
    Ok(())
}

fn onto_each<T: Editable>(
    edits: &HashMap<String, TitleEdit>,
    titles: &mut [T],
    id: fn(&T) -> &String,
) {
    for title in titles {
        if let Some(edit) = edits.get(id(title)) {
            edit.onto(title);
        }
    }
}

fn every(conn: &Connection, kind: &str) -> Result<HashMap<String, TitleEdit>> {
    let mut stmt =
        conn.prepare("SELECT subject_id, edit FROM title_edits WHERE subject_kind = ?1")?;
    let rows = stmt
        .query_map([kind], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(parsed(rows))
}

fn parsed(rows: Vec<(String, String)>) -> HashMap<String, TitleEdit> {
    rows.into_iter()
        .filter_map(|(id, edit)| Some((id, serde_json::from_str(&edit).ok()?)))
        .collect()
}

#[cfg(test)]
mod tests;
