//! Read-only catalog queries powering the **LLM connector** (`services::llm`).
//!
//! Where the rest of `db` serves the UI, these answer the questions a model asks
//! while curating: *"horror titles rated ≥7, newest first"*, *"everything Nolan
//! directed"*, *"which genres exist"*. All of it runs over the `metadata` JSON
//! column with SQLite's JSON1 (`json_each` / `json_extract`), across **movies and
//! shows** at once via a small `cat` CTE so a tool query spans the whole
//! library without the caller stitching two tables together.

use super::{params, parse_metadata, Pool, Result};
use crate::media::present_show;

use rusqlite::OptionalExtension;

use kroma_domain::Metadata;

mod find_titles;

#[cfg(test)]
mod test_support;

pub use find_titles::*;

// Every query below selects `FROM cat`. The trailing space is intentional:
// the per-query `SELECT …` is concatenated directly after it.
const CAT_CTE: &str = concat!(
    "WITH cat(id,title,year,kind,metadata,genres,overview,directors,actors) AS (\
    SELECT i.id,COALESCE(e.title,i.title),COALESCE(e.year,i.year),'movie',i.metadata,\
    COALESCE(e.genres,json_extract(i.metadata,'$.genres')),\
    COALESCE(e.overview,json_extract(i.metadata,'$.overview')),e.directors,\
    COALESCE(e.actors,json_extract(i.metadata,'$.cast')) \
    FROM items i LEFT JOIN title_shown e ON e.subject_kind = 'item' AND e.subject_id = i.id \
    WHERE i.kind != 'episode' AND i.absent_since IS NULL \
    UNION ALL SELECT s.id,COALESCE(e.title,s.title),COALESCE(e.year,s.year),'show',s.metadata,\
    COALESCE(e.genres,json_extract(s.metadata,'$.genres')),\
    COALESCE(e.overview,json_extract(s.metadata,'$.overview')),e.directors,\
    COALESCE(e.actors,json_extract(s.metadata,'$.cast')) \
    FROM shows s LEFT JOIN title_shown e ON e.subject_kind = 'show' AND e.subject_id = s.id \
    WHERE ",
    present_show!(),
    ") "
);

const DIRECTING_JOBS_SQL: &str = "('Director','Creator')";

/// A title in full form (`get_title`) adds people, synopsis, tagline.
pub struct TitleFull {
    pub id: String,
    pub title: String,
    pub year: Option<u32>,
    pub kind: String,
    pub rating: Option<f32>,
    pub genres: Vec<String>,
    pub directors: Vec<String>,
    pub cast: Vec<String>,
    pub overview: Option<String>,
    pub tagline: Option<String>,
}

/// Fetch one title's full data by **id first, else exact title** (case-
/// insensitive; highest-rated on a tie). `None` when nothing matches.
pub fn get_title(pool: &Pool, query: &str) -> Result<Option<TitleFull>> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(None);
    }
    let conn = pool.get()?;
    let sql = format!(
        "{CAT_CTE}SELECT id,title,year,kind,metadata,genres,overview,directors,actors FROM cat \
         WHERE id = ?1 OR title = ?1 COLLATE NOCASE \
         ORDER BY (id = ?1) DESC, CAST(json_extract(cat.metadata,'$.rating') AS REAL) DESC LIMIT 1"
    );
    let row = conn
        .query_row(&sql, params![q], |r| {
            let meta = parse_metadata(r.get::<_, Option<String>>(4)?);
            let full = full_from(r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, meta);
            let written = r.get::<_, Option<String>>(7)?;
            Ok(TitleFull {
                genres: list_in(r.get(5)?),
                overview: r.get(6)?,
                directors: written.map_or(full.directors, |names| list_in(Some(names))),
                cast: names_in(r.get(8)?),
                ..full
            })
        })
        .optional()?;
    Ok(row)
}

fn list_in(json: Option<String>) -> Vec<String> {
    json.and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default()
}

#[derive(serde::Deserialize)]
struct Named {
    name: String,
}

fn names_in(json: Option<String>) -> Vec<String> {
    let people: Vec<Named> = json
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default();
    people
        .into_iter()
        .take(10)
        .map(|person| person.name)
        .collect()
}

/// Every genre present, with how many titles carry it (most common first).
pub fn genre_counts(pool: &Pool) -> Result<Vec<(String, usize)>> {
    let conn = pool.get()?;
    let sql = format!(
        "{CAT_CTE}SELECT g.value AS genre, COUNT(*) AS n \
         FROM cat, json_each(cat.genres) g \
         GROUP BY genre ORDER BY n DESC, genre"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? as usize))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Most-credited people for a `role` (`"director"` default | `"actor"`), with
/// their title counts. Capped at `limit` (1..=100).
pub fn people_counts(pool: &Pool, role: &str, limit: usize) -> Result<Vec<(String, usize)>> {
    let lim = limit.clamp(1, 100);
    let sql = match role.trim().to_ascii_lowercase().as_str() {
        "actor" | "cast" => format!(
            "{CAT_CTE}SELECT json_extract(c.value,'$.name') AS name, COUNT(*) AS n \
             FROM cat, json_each(cat.actors) c \
             WHERE name IS NOT NULL AND name != '' \
             GROUP BY name ORDER BY n DESC, name LIMIT {lim}"
        ),
        _ => format!(
            "{CAT_CTE}SELECT name, COUNT(*) AS n FROM (\
               SELECT json_extract(c.value,'$.name') AS name \
               FROM cat, json_each(cat.metadata,'$.crew') c \
               WHERE cat.directors IS NULL AND json_extract(c.value,'$.job') IN {DIRECTING_JOBS_SQL} \
               UNION ALL SELECT d.value FROM cat, json_each(cat.directors) d) \
             WHERE name IS NOT NULL AND name != '' \
             GROUP BY name ORDER BY n DESC, name LIMIT {lim}"
        ),
    };
    let conn = pool.get()?;
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? as usize))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn full_from(
    id: String,
    title: String,
    year: Option<u32>,
    kind: String,
    meta: Option<Metadata>,
) -> TitleFull {
    let Some(m) = meta else {
        return TitleFull {
            id,
            title,
            year,
            kind,
            rating: None,
            genres: Vec::new(),
            directors: Vec::new(),
            cast: Vec::new(),
            overview: None,
            tagline: None,
        };
    };
    let directors = m
        .crew
        .iter()
        .filter(|c| matches!(c.job.as_str(), "Director" | "Creator"))
        .map(|c| c.name.clone())
        .collect();
    TitleFull {
        id,
        title,
        year,
        kind,
        rating: m.rating,
        genres: m.genres,
        directors,
        cast: Vec::new(),
        overview: m.overview,
        tagline: m.tagline,
    }
}

#[cfg(test)]
mod tests;
