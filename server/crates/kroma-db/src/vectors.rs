//! Content-embedding storage + brute-force vector search.
//!
//! One row per title (movie OR show) in `item_vectors`, stored L2-normalized so
//! cosine similarity is a plain dot product. Past ~50k items, swap
//! [`load_vectors`] for an ANN index; the public functions stay the same.

use std::collections::HashSet;

use rusqlite::OptionalExtension;

use super::*;

mod recommendations;
mod search;

#[cfg(test)]
mod test_support;

pub use recommendations::*;
pub use search::*;

/// Insert/replace one title's embedding. `vec` MUST already be L2-normalized.
pub fn set_item_vector(pool: &Pool, id: &str, vec: &[f32]) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO item_vectors (id, dim, vec, updated_at) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(id) DO UPDATE SET dim=excluded.dim, vec=excluded.vec, updated_at=excluded.updated_at",
        params![id, vec.len() as i64, vec_to_blob(vec), now_or_blank()],
    )?;
    Ok(())
}

/// Ids that have a stored embedding.
pub fn item_ids_with_vector(pool: &Pool) -> Result<HashSet<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT id FROM item_vectors")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Whether a title has a stored embedding.
pub fn has_vector(pool: &Pool, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM item_vectors WHERE id=?1",
        params![id],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

/// Delete one title's stored embedding, so a reprocess recomputes it.
pub fn clear_item_vector(pool: &Pool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute("DELETE FROM item_vectors WHERE id=?1", params![id])?;
    Ok(())
}

/// The stored embedding dimension for one id, or `None` if unset. Cheaper than
/// [`vector_dims`] when checking a single id.
pub fn vector_dim(pool: &Pool, id: &str) -> Result<Option<usize>> {
    let conn = pool.get()?;
    let dim: Option<i64> = conn
        .query_row(
            "SELECT dim FROM item_vectors WHERE id=?1",
            params![id],
            |r| r.get(0),
        )
        .optional()?;
    Ok(dim.map(|d| d as usize))
}

/// Current stored embedding dimension per id, so a re-embed can skip vectors
/// already at the active embedder's dim.
pub fn vector_dims(pool: &Pool) -> Result<std::collections::HashMap<String, usize>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT id, dim FROM item_vectors")?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? as usize))
    })?;
    Ok(rows.filter_map(std::result::Result::ok).collect())
}

/// Drop vectors whose id is no longer a live item or show (call after a rescan;
/// `item_vectors` has no FK because it spans both tables).
pub fn prune_orphan_vectors(pool: &Pool) -> Result<usize> {
    let conn = pool.get()?;
    let n = conn.execute(
        "DELETE FROM item_vectors WHERE id NOT IN (SELECT id FROM items) \
                                     AND id NOT IN (SELECT id FROM shows)",
        [],
    )?;
    Ok(n)
}

/// Load every stored vector as `(id, vector)`. The working set for all searches.
pub fn load_vectors(pool: &Pool) -> Result<Vec<(String, Vec<f32>)>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT id, vec FROM item_vectors")?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            blob_to_vec(&r.get::<_, Vec<u8>>(1)?),
        ))
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn vec_to_blob(v: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(v.len() * 4);
    for x in v {
        bytes.extend_from_slice(&x.to_le_bytes());
    }
    bytes
}

fn blob_to_vec(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vectors::test_support::*;

    #[test]
    fn store_query_and_dims() {
        let p = seeded();
        assert!(has_vector(&p, "a").unwrap());
        assert!(!has_vector(&p, "ghost").unwrap());
        assert_eq!(item_ids_with_vector(&p).unwrap().len(), 3);
        assert_eq!(vector_dim(&p, "a").unwrap(), Some(2));
        assert!(vector_dim(&p, "ghost").unwrap().is_none());
        assert_eq!(vector_dims(&p).unwrap().len(), 3);

        // Blob roundtrip is bit-exact.
        let loaded: std::collections::HashMap<String, Vec<f32>> =
            load_vectors(&p).unwrap().into_iter().collect();
        assert_eq!(loaded["b"], vec![0.8, 0.6]);

        // Upsert overwrites in place (dim can change).
        set_item_vector(&p, "a", &[0.0, 0.0, 1.0]).unwrap();
        assert_eq!(vector_dim(&p, "a").unwrap(), Some(3));

        clear_item_vector(&p, "a").unwrap();
        assert!(!has_vector(&p, "a").unwrap());
    }

    #[test]
    fn prune_orphans_drops_vectors_without_a_title() {
        let p = seeded();
        // Add a vector for an id that is neither an item nor a show.
        set_item_vector(&p, "orphan", &[1.0, 1.0]).unwrap();
        assert_eq!(prune_orphan_vectors(&p).unwrap(), 1);
        assert!(!has_vector(&p, "orphan").unwrap());
        assert!(has_vector(&p, "a").unwrap());
    }
}
