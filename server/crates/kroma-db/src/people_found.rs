//! Who TMDB says each person written for a title is, when the provider gave
//! nobody of that name for it (LIB-99). A background job asks TMDB once for
//! each name written by hand or read from a `.nfo` file.

use std::collections::HashMap;

use kroma_domain::title_edit::TitleEdit;
use kroma_domain::Metadata;

use crate::{params, Connection, Pool, Result};

/// What TMDB answered for one name: nobody, or the person and their portrait,
/// served from `profile_url` once cached from `profile_source`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Found {
    pub tmdb_id: Option<u64>,
    pub profile_url: Option<String>,
    pub profile_source: Option<String>,
}

macro_rules! written {
    ($table:literal, $kind:literal) => {
        concat!(
            "SELECT json_extract(a.value,'$.name') FROM ", $table, " t \
               JOIN title_shown e ON e.subject_kind = '", $kind, "' AND e.subject_id = t.id, \
                    json_each(e.actors) a \
              WHERE NOT EXISTS (SELECT 1 FROM json_each(t.metadata,'$.cast') p \
                     WHERE lower(json_extract(p.value,'$.name')) = lower(json_extract(a.value,'$.name'))) \
             UNION \
             SELECT d.value FROM ", $table, " t \
               JOIN title_shown e ON e.subject_kind = '", $kind, "' AND e.subject_id = t.id, \
                    json_each(e.directors) d \
              WHERE NOT EXISTS (SELECT 1 FROM json_each(t.metadata,'$.crew') p \
                     WHERE json_extract(p.value,'$.job') IN ('Director','Creator') \
                       AND lower(json_extract(p.value,'$.name')) = lower(d.value))"
        )
    };
}

const UNSEARCHED: &str = concat!(
    "WITH written(name) AS (",
    written!("items", "item"),
    " UNION ",
    written!("shows", "show"),
    ") SELECT w.name FROM written w LEFT JOIN people_found f ON f.name = w.name \
      WHERE w.name IS NOT NULL \
        AND (f.name IS NULL OR (f.tmdb_id IS NULL AND f.searched_at < ?1)) \
      ORDER BY w.name"
);

/// Every name written for a title that the provider credits nobody under, and
/// that TMDB was not asked about yet, or answered nobody for before
/// `asked_before` (milliseconds since the epoch).
pub fn unsearched(pool: &Pool, asked_before: i64) -> Result<Vec<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(UNSEARCHED)?;
    let names = stmt.query_map([asked_before], |r| r.get(0))?;
    Ok(names.collect::<rusqlite::Result<_>>()?)
}

/// Keep what TMDB answered for `name`, in place of what it answered before.
pub fn keep(pool: &Pool, name: &str, found: &Found) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT OR REPLACE INTO people_found \
         (name, tmdb_id, profile_url, profile_source, searched_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            name,
            found.tmdb_id.and_then(|id| i64::try_from(id).ok()),
            found.profile_url,
            found.profile_source,
            kroma_primitives::now_ms()
        ],
    )?;
    Ok(())
}

/// The TMDB address the portrait served from `url` was cached from.
pub fn source_of(pool: &Pool, url: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    let mut stmt =
        conn.prepare("SELECT profile_source FROM people_found WHERE profile_url = ?1 LIMIT 1")?;
    let mut rows = stmt.query_map([url], |r| r.get(0))?;
    Ok(rows.next().transpose()?.flatten())
}

/// The people TMDB found for the names some edits write, by name.
#[derive(Debug, Default)]
pub(crate) struct People(HashMap<String, Found>);

impl People {
    pub(crate) fn written_in<'a>(
        conn: &Connection,
        edits: impl IntoIterator<Item = &'a TitleEdit>,
    ) -> Result<Self> {
        let names: Vec<&str> = edits.into_iter().flat_map(names).collect();
        if names.is_empty() {
            return Ok(Self::default());
        }
        let mut stmt = conn.prepare(
            "SELECT f.name, f.tmdb_id, f.profile_url FROM people_found f \
               JOIN json_each(?1) n ON n.value = f.name WHERE f.tmdb_id IS NOT NULL",
        )?;
        let rows = stmt.query_map([serde_json::to_string(&names)?], |r| {
            let found = Found {
                tmdb_id: r
                    .get::<_, Option<i64>>(1)?
                    .and_then(|id| u64::try_from(id).ok()),
                profile_url: r.get(2)?,
                profile_source: None,
            };
            Ok((r.get(0)?, found))
        })?;
        Ok(Self(rows.collect::<rusqlite::Result<_>>()?))
    }

    pub(crate) fn onto(&self, meta: Option<&mut Metadata>) {
        let Some(meta) = meta.filter(|_| !self.0.is_empty()) else {
            return;
        };
        let cast = (meta.cast.iter_mut()).map(|m| (&m.name, &mut m.tmdb_id, &mut m.profile_url));
        let crew = (meta.crew.iter_mut()).map(|m| (&m.name, &mut m.tmdb_id, &mut m.profile_url));
        for (name, tmdb_id, profile_url) in cast.chain(crew) {
            if let Some(found) = self.missing(name, *tmdb_id) {
                *tmdb_id = found.tmdb_id;
                profile_url.clone_from(&found.profile_url);
            }
        }
    }

    fn missing(&self, name: &str, tmdb_id: Option<u64>) -> Option<&Found> {
        tmdb_id.map_or_else(|| self.0.get(name), |_| None)
    }
}

fn names(edit: &TitleEdit) -> impl Iterator<Item = &str> {
    let cast = edit.cast.iter().flatten().map(|actor| actor.name.as_str());
    let directors = edit.directors.iter().flatten().map(String::as_str);
    cast.chain(directors)
}

#[cfg(test)]
mod tests;
