//! There is no person table: cast and crew live in each title's `metadata`
//! JSON, so a lookup reads every credit through SQLite's JSON1 and matches them
//! in Rust. Folding is why it cannot be a `WHERE`: a slug has already lost the
//! accents and punctuation an SQL comparison would need.

use anyhow::Result;
use rusqlite::Connection;

use kroma_domain::people::{self, Credit, CreditedTitle, PersonMatch};
use kroma_domain::slug::{slug_eq, slugify};

use crate::Pool;

macro_rules! credits {
    ($table:literal, $kind:literal, $kept:literal) => {
        concat!(
            "SELECT t.id, json_extract(c.value,'$.name'), json_extract(c.value,'$.tmdbId') \
               FROM ", $table, " t \
               LEFT JOIN title_shown e ON e.subject_kind = '", $kind, "' AND e.subject_id = t.id, \
                    json_each(t.metadata,'$.cast') c \
              WHERE ", $kept, " AND e.actors IS NULL \
             UNION ALL \
             SELECT t.id, json_extract(a.value,'$.name'), \
                    (SELECT json_extract(p.value,'$.tmdbId') FROM json_each(t.metadata,'$.cast') p \
                      WHERE lower(json_extract(p.value,'$.name')) = lower(json_extract(a.value,'$.name')) \
                      LIMIT 1) \
               FROM ", $table, " t \
               JOIN title_shown e ON e.subject_kind = '", $kind, "' AND e.subject_id = t.id, \
                    json_each(e.actors) a \
              WHERE ", $kept, " \
             UNION ALL \
             SELECT t.id, json_extract(c.value,'$.name'), json_extract(c.value,'$.tmdbId') \
               FROM ", $table, " t \
               LEFT JOIN title_shown e ON e.subject_kind = '", $kind, "' AND e.subject_id = t.id, \
                    json_each(t.metadata,'$.crew') c \
              WHERE ", $kept, " \
                AND (e.directors IS NULL OR json_extract(c.value,'$.job') NOT IN ('Director','Creator')) \
             UNION ALL \
             SELECT t.id, d.value, \
                    (SELECT json_extract(p.value,'$.tmdbId') FROM json_each(t.metadata,'$.crew') p \
                      WHERE json_extract(p.value,'$.job') IN ('Director','Creator') \
                        AND lower(json_extract(p.value,'$.name')) = lower(d.value) LIMIT 1) \
               FROM ", $table, " t \
               JOIN title_shown e ON e.subject_kind = '", $kind, "' AND e.subject_id = t.id, \
                    json_each(e.directors) d \
              WHERE ", $kept
        )
    };
}

const MOVIE_CREDITS: &str = credits!("items", "item", "t.kind != 'episode'");

const SHOW_CREDITS: &str = credits!("shows", "show", "TRUE");

/// The person `lookup` names, with the movies and shows crediting them.
/// `lookup` is a provider person id, a URL slug, or a display name in any
/// casing; see [`people::resolve_person`] for which one answers. Episodes are
/// excluded: they inherit their show's credits.
pub fn resolve_person(pool: &Pool, lookup: &str) -> Result<Option<PersonMatch>> {
    let want = slugify(lookup);
    if want.is_empty() {
        return Ok(None);
    }
    let id = lookup.parse::<u64>().ok();
    // The id and the fold are both answered here so that a credit which is
    // neither never becomes a `Credit`: `people::resolve_person` re-applies the
    // same rules over the survivors, which is where the namesake tie-break lives.
    let keep = |name: &str, credit_id: Option<u64>| {
        (id.is_some() && credit_id == id) || slug_eq(name, &want)
    };
    let conn = pool.get()?;
    let mut credits = read_credits(&conn, MOVIE_CREDITS, CreditedTitle::Movie, &keep)?;
    credits.extend(read_credits(
        &conn,
        SHOW_CREDITS,
        CreditedTitle::Show,
        &keep,
    )?);
    Ok(people::resolve_person(credits, lookup))
}

fn read_credits(
    conn: &Connection,
    sql: &str,
    title: fn(String) -> CreditedTitle,
    keep: &dyn Fn(&str, Option<u64>) -> bool,
) -> Result<Vec<Credit>> {
    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([])?;
    let mut credits = Vec::new();
    // `get_ref` BORROWS out of the statement; `get` would build a String for
    // every credit in the library before anything could reject it, and only a
    // handful are ever the person being looked up.
    while let Some(row) = rows.next()? {
        let Ok(name) = row.get_ref(1)?.as_str() else {
            continue;
        };
        let tmdb_id = row
            .get_ref(2)?
            .as_i64_or_null()?
            .and_then(|id| u64::try_from(id).ok());
        if !keep(name, tmdb_id) {
            continue;
        }
        credits.push(Credit {
            name: name.to_string(),
            tmdb_id,
            title: title(row.get::<_, String>(0)?),
        });
    }
    Ok(credits)
}

#[cfg(test)]
mod tests;
