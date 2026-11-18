//! The path translation of each server an import read: where the folders the
//! owner confirmed are on this machine.

use kroma_domain::imports::KeptFolder;

use crate::{Pool, Result, params};

/// Keeps where each of `folders` is on this machine. A folder kept before
/// takes the newer answer.
pub fn keep_folders(pool: &Pool, server_id: &str, folders: &[KeptFolder]) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO import_folders (server_id, folder, here) VALUES (?1, ?2, ?3) \
             ON CONFLICT(server_id, folder) DO UPDATE SET here = excluded.here",
        )?;
        for kept in folders {
            stmt.execute(params![server_id, kept.folder, kept.here])?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// Every folder of one server the owner confirmed, by the other server's name
/// for it.
pub fn kept_folders(pool: &Pool, server_id: &str) -> Result<Vec<KeptFolder>> {
    let conn = pool.get()?;
    let mut stmt = conn
        .prepare("SELECT folder, here FROM import_folders WHERE server_id = ?1 ORDER BY folder")?;
    let rows = stmt.query_map([server_id], |r| {
        Ok(KeptFolder {
            folder: r.get(0)?,
            here: r.get(1)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}
