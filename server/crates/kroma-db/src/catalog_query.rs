//! Read-only catalog queries powering the **LLM connector** (`services::llm`).
//!
//! Where the rest of `db` serves the UI, these answer the questions a model asks
//! while curating: *"horror titles rated ≥7, newest first"*, *"everything Nolan
//! directed"*, *"which genres exist"*. All of it runs over the `metadata` JSON
//! column with SQLite's JSON1 (`json_each` / `json_extract`), across **movies and
//! shows** at once via a small `cat` CTE so a tool query spans the whole
//! library without the caller stitching two tables together.

use super::*;

use rusqlite::OptionalExtension;

use kroma_domain::Metadata;

mod find_titles;

#[cfg(test)]
mod test_support;

pub use find_titles::*;

// Every query below selects `FROM cat`. The trailing space is intentional:
// the per-query `SELECT …` is concatenated directly after it.
const CAT_CTE: &str = "WITH cat(id,title,year,kind,metadata) AS (\
    SELECT id,title,year,'movie',metadata FROM items WHERE kind != 'episode' \
    UNION ALL SELECT id,title,year,'show',metadata FROM shows) ";

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
        "{CAT_CTE}SELECT id,title,year,kind,metadata FROM cat \
         WHERE id = ?1 OR title = ?1 COLLATE NOCASE \
         ORDER BY (id = ?1) DESC, CAST(json_extract(cat.metadata,'$.rating') AS REAL) DESC LIMIT 1"
    );
    let row = conn
        .query_row(&sql, params![q], |r| {
            let meta = parse_metadata(r.get::<_, Option<String>>(4)?);
            Ok(full_from(r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, meta))
        })
        .optional()?;
    Ok(row)
}

/// Every genre present, with how many titles carry it (most common first).
pub fn genre_counts(pool: &Pool) -> Result<Vec<(String, usize)>> {
    let conn = pool.get()?;
    let sql = format!(
        "{CAT_CTE}SELECT g.value AS genre, COUNT(*) AS n \
         FROM cat, json_each(cat.metadata,'$.genres') g \
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
             FROM cat, json_each(cat.metadata,'$.cast') c \
             WHERE name IS NOT NULL AND name != '' \
             GROUP BY name ORDER BY n DESC, name LIMIT {lim}"
        ),
        _ => format!(
            "{CAT_CTE}SELECT json_extract(c.value,'$.name') AS name, COUNT(*) AS n \
             FROM cat, json_each(cat.metadata,'$.crew') c \
             WHERE json_extract(c.value,'$.job') IN {DIRECTING_JOBS_SQL} AND name IS NOT NULL AND name != '' \
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
    let cast = m.cast.iter().take(10).map(|c| c.name.clone()).collect();
    TitleFull {
        id,
        title,
        year,
        kind,
        rating: m.rating,
        genres: m.genres,
        directors,
        cast,
        overview: m.overview,
        tagline: m.tagline,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog_query::test_support::*;

    #[test]
    fn get_title_and_counts() {
        let pool = seeded_pool();
        let dune = get_title(&pool, "Dune").unwrap().unwrap();
        assert_eq!(dune.id, "m1");
        assert_eq!(dune.directors, ["Denis Villeneuve"]);
        assert_eq!(dune.cast, ["Timothée Chalamet"]);
        assert_eq!(
            get_title(&pool, "m3").unwrap().unwrap().title,
            "The Shining"
        );
        assert!(get_title(&pool, "Nonexistent").unwrap().is_none());

        let genres = genre_counts(&pool).unwrap();
        let horror = genres.iter().find(|(g, _)| g == "Horror").unwrap();
        assert_eq!(horror.1, 2);

        let directors = people_counts(&pool, "director", 10).unwrap();
        assert_eq!(directors[0], ("Denis Villeneuve".to_string(), 2)); // most prolific first
    }

    #[test]
    fn a_blank_lookup_finds_nothing_and_an_unknown_kind_reads_as_movie() {
        let pool = seeded_pool();
        assert!(get_title(&pool, "   ").unwrap().is_none());
        assert!(get_title(&pool, "").unwrap().is_none());

        let unknown_kind = find_titles(
            &pool,
            &TitleFilter {
                kind: Some("documentary".into()),
                limit: Some(50),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(unknown_kind.iter().all(|t| t.kind == "movie"));
        assert_eq!(unknown_kind.len(), 5);
    }

    #[test]
    fn titles_by_person_spans_cast_and_crew() {
        let pool = seeded_pool();

        // Crew credit (and case-insensitive): the two films Villeneuve directed.
        let (mut movies, shows) = crate::titles_by_person(&pool, "denis villeneuve").unwrap();
        movies.sort();
        assert_eq!(movies, ["m1", "m2"]);
        assert!(shows.is_empty());

        // Cast credit on a show (and the episode is never returned on its own).
        let (movies, shows) = crate::titles_by_person(&pool, "Adam Scott").unwrap();
        assert!(movies.is_empty());
        assert_eq!(shows, ["s1"]);

        // Cast credit on a movie.
        let (movies, _) = crate::titles_by_person(&pool, "Timothée Chalamet").unwrap();
        assert_eq!(movies, ["m1"]);

        // Unknown person / blank name → nothing.
        assert_eq!(
            crate::titles_by_person(&pool, "Nobody").unwrap(),
            (vec![], vec![])
        );
        assert_eq!(
            crate::titles_by_person(&pool, "  ").unwrap(),
            (vec![], vec![])
        );
    }
}
