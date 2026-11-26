//! The embedder's vector of each phrase the home ranks titles against, kept
//! between starts.

use rusqlite::OptionalExtension;

use super::{blob_to_vec, vec_to_blob};
use crate::{params, Pool, Result};

const MOST_KEPT: i64 = 1024;

/// One phrase, as the module `module` embeds it at the width `dim`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Phrase<'a> {
    pub module: &'a str,
    pub dim: usize,
    pub text: &'a str,
}

/// The vector kept for `phrase`, `None` when there is none or it was embedded
/// at another width.
pub fn phrase_vector(pool: &Pool, phrase: &Phrase) -> Result<Option<Vec<f32>>> {
    let conn = pool.get()?;
    let blob: Option<Vec<u8>> = conn
        .query_row(
            "SELECT vec FROM phrase_vectors WHERE module = ?1 AND phrase = ?2 AND dim = ?3",
            params![phrase.module, phrase.text, phrase.dim as i64],
            |r| r.get(0),
        )
        .optional()?;
    Ok(blob.as_deref().map(blob_to_vec))
}

/// Keep `vec` as the vector of `phrase`, replacing the one kept before. Only a
/// bounded number of the newest stay, so a phrase nothing asks for any more
/// leaves on its own.
pub fn keep_phrase_vector(pool: &Pool, phrase: &Phrase, vec: &[f32]) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO phrase_vectors (module, phrase, dim, vec, kept_at) VALUES (?1, ?2, ?3, ?4, ?5) \
         ON CONFLICT(module, phrase) DO UPDATE SET dim = excluded.dim, vec = excluded.vec, kept_at = excluded.kept_at",
        params![
            phrase.module,
            phrase.text,
            vec.len() as i64,
            vec_to_blob(vec),
            kroma_primitives::now_ms()
        ],
    )?;
    conn.execute(
        "DELETE FROM phrase_vectors WHERE rowid NOT IN \
         (SELECT rowid FROM phrase_vectors ORDER BY kept_at DESC, rowid DESC LIMIT ?1)",
        params![MOST_KEPT],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests;
