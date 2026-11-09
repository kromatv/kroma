//! What the hero is scored on, read straight from the rows: no title is
//! hydrated (no files, tracks or metadata blob) until one of them has won.

use anyhow::Result;
use rusqlite::Row;

use crate::Pool;

/// One movie or show the hero may be picked from. `width` and `hdr` describe the
/// stream a hydrated title would show as its own (`0` and `false` without one).
#[derive(Debug, Clone, PartialEq)]
pub struct HeroCandidate {
    pub id: String,
    pub added_at: String,
    pub has_backdrop: bool,
    pub has_overview: bool,
    pub rating: Option<f32>,
    pub width: u32,
    pub hdr: bool,
}

// What a title's metadata blob says, read in SQLite so no blob is decoded in
// Rust. A blob that is not JSON, or a rating that is not a number, reads as
// absent rather than failing the whole read.
const FACTS: &str = "json_extract(meta, '$.backdropUrl') IS NOT NULL, \
     COALESCE(json_extract(meta, '$.overview'), '') != '', \
     CASE WHEN json_type(meta, '$.rating') IN ('integer', 'real') \
          THEN json_extract(meta, '$.rating') END";

// The representative file is the one MEDIA-8 ranks first: a file that opened
// before an unprobed one before a broken one, then the widest, then HDR. Only
// its width and HDR flag are read, and the later rank keys cannot change those.
const MOVIE_FILES: &str = "SELECT f.item_id AS owner, \
       CASE WHEN f.probed = 1 AND f.v_codec IS NOT NULL THEN COALESCE(f.v_width, 0) ELSE 0 END AS width, \
       f.probed = 1 AND f.v_codec IS NOT NULL AND COALESCE(f.v_hdr, 0) != 0 AS hdr, \
       ROW_NUMBER() OVER (PARTITION BY f.item_id ORDER BY \
         CASE WHEN f.unreadable IS NOT NULL THEN 0 WHEN f.probed = 0 THEN 1 ELSE 2 END DESC, \
         CASE WHEN f.v_codec IS NULL THEN 0 ELSE COALESCE(f.v_width, 0) END DESC, \
         (f.v_codec IS NOT NULL AND COALESCE(f.v_hdr, 0) != 0) DESC) AS rank \
     FROM files f JOIN items i ON i.id = f.item_id WHERE i.kind != 'episode'";

const MOVIES: &str = "SELECT id, added_at, \
       CASE WHEN json_valid(metadata) THEN metadata END AS meta \
     FROM items WHERE kind != 'episode'";

// A show wears its widest probed episode, the same pick its listing makes.
const SHOW_FILES: &str = "SELECT i.show_id AS owner, COALESCE(f.v_width, 0) AS width, \
       COALESCE(f.v_hdr, 0) != 0 AS hdr, \
       ROW_NUMBER() OVER (PARTITION BY i.show_id ORDER BY \
         f.v_width DESC NULLS LAST, COALESCE(f.v_hdr, 0) DESC) AS rank \
     FROM files f JOIN items i ON i.id = f.item_id \
     WHERE i.show_id IS NOT NULL AND f.probed = 1 AND f.v_codec IS NOT NULL";

const SHOWS: &str = "SELECT id, added_at, \
       CASE WHEN json_valid(metadata) THEN metadata END AS meta FROM shows";

/// Every movie and loose video (never an episode) as a [`HeroCandidate`].
pub fn hero_movie_candidates(pool: &Pool) -> Result<Vec<HeroCandidate>> {
    read(pool, MOVIES, MOVIE_FILES)
}

/// Every show as a [`HeroCandidate`].
pub fn hero_show_candidates(pool: &Pool) -> Result<Vec<HeroCandidate>> {
    read(pool, SHOWS, SHOW_FILES)
}

fn read(pool: &Pool, titles: &str, files: &str) -> Result<Vec<HeroCandidate>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(&format!(
        "WITH titles AS ({titles}), ranked AS ({files}) \
         SELECT t.id, t.added_at, {FACTS}, COALESCE(r.width, 0), COALESCE(r.hdr, 0) \
         FROM titles t LEFT JOIN ranked r ON r.owner = t.id AND r.rank = 1"
    ))?;
    let rows = stmt.query_map([], candidate)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn candidate(r: &Row) -> rusqlite::Result<HeroCandidate> {
    Ok(HeroCandidate {
        id: r.get(0)?,
        added_at: r.get(1)?,
        has_backdrop: r.get(2)?,
        has_overview: r.get(3)?,
        rating: r.get::<_, Option<f64>>(4)?.map(|v| v as f32),
        width: r.get(5)?,
        hdr: r.get(6)?,
    })
}

#[cfg(test)]
mod tests;
