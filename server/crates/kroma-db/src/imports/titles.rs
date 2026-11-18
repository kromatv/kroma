//! The titles another server described, by its id for each, and the ones an
//! import could match to nothing here.

use std::collections::HashMap;

use kroma_domain::import::Title;

use crate::{Pool, Result, params, query_by_subject_ids};

/// Keeps what the other server says each title is. A title it described the
/// same way before is not written again.
pub fn describe(pool: &Pool, server_id: &str, titles: &[&Title]) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO import_titles (server_id, title_id, described) VALUES (?1, ?2, ?3) \
             ON CONFLICT(server_id, title_id) DO UPDATE SET described = excluded.described \
             WHERE import_titles.described <> excluded.described",
        )?;
        for title in titles {
            stmt.execute(params![server_id, title.id, serde_json::to_string(title)?])?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// The titles of `ids` the other server described, by id.
pub fn described(pool: &Pool, server_id: &str, ids: &[&str]) -> Result<HashMap<String, Title>> {
    let conn = pool.get()?;
    let rows = query_by_subject_ids(
        &conn,
        server_id,
        ids,
        &[],
        |placeholders| {
            format!(
                "SELECT described FROM import_titles \
                 WHERE server_id = ? AND title_id IN ({placeholders})"
            )
        },
        |r| r.get::<_, String>(0),
    )?;
    Ok(rows
        .iter()
        .filter_map(|described| serde_json::from_str::<Title>(described).ok())
        .map(|title| (title.id.clone(), title))
        .collect())
}

/// Lists `title_ids` as matched to nothing by `import_id`, each once.
pub fn add_unmatched(pool: &Pool, import_id: &str, title_ids: &[&str]) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT OR IGNORE INTO import_unmatched (import_id, title_id) VALUES (?1, ?2)",
        )?;
        for title_id in title_ids {
            stmt.execute(params![import_id, title_id])?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// A window on the titles an import matched to nothing.
#[derive(Debug, Clone, Copy)]
pub struct Window {
    pub offset: usize,
    pub limit: usize,
}

/// The titles `import_id` matched to nothing, as the other server described
/// them, in a stable order.
pub fn unmatched(pool: &Pool, import_id: &str, window: Window) -> Result<Vec<Title>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT t.described FROM import_unmatched u \
         JOIN imports i ON i.id = u.import_id \
         JOIN import_titles t ON t.server_id = i.server_id AND t.title_id = u.title_id \
         WHERE u.import_id = ?1 ORDER BY u.title_id LIMIT ?2 OFFSET ?3",
    )?;
    let rows = stmt.query_map(
        params![import_id, window.limit as i64, window.offset as i64],
        |r| r.get::<_, String>(0),
    )?;
    let described = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(described
        .iter()
        .filter_map(|text| serde_json::from_str(text).ok())
        .collect())
}
