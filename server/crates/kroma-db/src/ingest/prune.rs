//! What a walk that read every folder removes: the files it did not find, then
//! the titles left with none.

use std::collections::HashSet;

use anyhow::Result;
use rusqlite::params;

use kroma_domain::MediaItem;

use crate::vectors::prune_orphan_vectors;
use crate::Pool;

/// Removes every library `configured` does not name, with its titles and what
/// they cached. That is the owner's change of configuration and not something
/// a walk infers, so it does not wait for a walk to end. Returns how many
/// libraries went.
pub fn drop_unconfigured_libraries(pool: &Pool, configured: &[&str]) -> Result<usize> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    let dropped = delete_unlisted_libraries(&tx, configured)?;
    if dropped > 0 {
        prune_rows_of_gone_titles(&tx)?;
    }
    tx.commit()?;
    if dropped > 0 {
        let _ = prune_orphan_vectors(pool);
    }
    Ok(dropped)
}

// Deletes only the libraries not listed: a wholesale DELETE FROM libraries would
// cascade to items/files and wipe what a sync preserves.
pub(super) fn delete_unlisted_libraries(
    tx: &rusqlite::Transaction,
    listed: &[&str],
) -> Result<usize> {
    let mut existing: Vec<String> = Vec::new();
    {
        let mut q = tx.prepare("SELECT id FROM libraries")?;
        let rows = q.query_map([], |r| r.get::<_, String>(0))?;
        for r in rows {
            existing.push(r?);
        }
    }
    let mut del = tx.prepare("DELETE FROM libraries WHERE id = ?1")?;
    let mut deleted = 0;
    for id in &existing {
        if !listed.contains(&id.as_str()) {
            deleted += del.execute(params![id])?;
        }
    }
    Ok(deleted)
}

pub(super) fn delete_gone_files(
    tx: &rusqlite::Transaction,
    items: &[MediaItem],
    unread: &HashSet<String>,
) -> Result<()> {
    let scanned: HashSet<&str> = items
        .iter()
        .flat_map(|i| i.files.iter())
        .filter_map(|f| f.abs_path.as_deref())
        .collect();
    let mut existing: Vec<(String, String, String)> = Vec::new();
    {
        let mut q = tx.prepare(
            "SELECT f.id, f.abs_path, i.library FROM files f JOIN items i ON i.id = f.item_id",
        )?;
        let rows = q.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        for r in rows {
            existing.push(r?);
        }
    }
    let mut del = tx.prepare("DELETE FROM files WHERE id = ?1")?;
    for (id, abs, library) in &existing {
        if !scanned.contains(abs.as_str()) && !unread.contains(library) {
            del.execute(params![id])?;
        }
    }
    Ok(())
}

// Prunes items/shows with no backing files, then the language-cache rows for
// vanished titles (no FK on those tables, so the item/show cascade misses them).
pub(super) fn prune_orphans(tx: &rusqlite::Transaction) -> Result<()> {
    tx.execute(
        "DELETE FROM items WHERE id NOT IN (SELECT DISTINCT item_id FROM files)",
        [],
    )?;
    tx.execute("DELETE FROM shows WHERE id NOT IN (SELECT DISTINCT show_id FROM items WHERE show_id IS NOT NULL)", [])?;
    prune_rows_of_gone_titles(tx)
}

fn prune_rows_of_gone_titles(tx: &rusqlite::Transaction) -> Result<()> {
    tx.execute(
        "DELETE FROM metadata_core WHERE \
            (subject_kind='item' AND subject_id NOT IN (SELECT id FROM items)) OR \
            (subject_kind='show' AND subject_id NOT IN (SELECT id FROM shows))",
        [],
    )?;
    tx.execute(
        "DELETE FROM translations WHERE subject_kind IN ('item','episode') \
            AND subject_id NOT IN (SELECT id FROM items)",
        [],
    )?;
    tx.execute(
        "DELETE FROM translations WHERE subject_kind='show' \
            AND subject_id NOT IN (SELECT id FROM shows)",
        [],
    )?;
    tx.execute(
        "DELETE FROM translations WHERE subject_kind='season_cast' \
            AND substr(subject_id, 1, instr(subject_id, ':') - 1) NOT IN (SELECT id FROM shows)",
        [],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests;
