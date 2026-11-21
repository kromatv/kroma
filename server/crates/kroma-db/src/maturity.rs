//! A profile's maturity level and ratings country, and what a title is held to
//! for a profile: the library it is in and the ratings it carries, an episode
//! carrying its show's.

use std::collections::HashMap;

use rusqlite::OptionalExtension;

use super::{Connection, IN_CHUNK, Pool, Result, params};

use kroma_domain::{CountryRatings, MaturityLevel};

/// The two maturity settings stored on an account. `ratings_country` is `None`
/// until the person picks one, and reads as the server's metadata country.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ProfileMaturity {
    pub level: MaturityLevel,
    pub ratings_country: Option<String>,
}

/// What the gate weighs one title by. `certification` is the bare label a
/// title enriched before every country was kept still carries.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TitleAccess {
    pub library: String,
    pub ratings: CountryRatings,
    pub certification: Option<String>,
}

/// An unknown account reads as one that never chose anything.
pub fn profile_maturity(pool: &Pool, user_id: &str) -> Result<ProfileMaturity> {
    let conn = pool.get()?;
    let row = conn
        .query_row(
            "SELECT maturity, ratings_country FROM users WHERE id = ?1",
            params![user_id],
            |r| Ok((r.get::<_, Option<i64>>(0)?, r.get::<_, Option<String>>(1)?)),
        )
        .optional()?;
    let (stored, ratings_country) = row.unwrap_or_default();
    Ok(ProfileMaturity {
        level: stored.map_or(MaturityLevel::Adult, level_at_most),
        ratings_country,
    })
}

/// 18+ is stored as `NULL`, the value every account had before levels existed.
/// `false` when no account has `user_id`.
pub fn set_maturity_level(pool: &Pool, user_id: &str, level: MaturityLevel) -> Result<bool> {
    let stored = (level != MaturityLevel::Adult).then_some(i64::from(level.age()));
    let sql = "UPDATE users SET maturity = ?2 WHERE id = ?1";
    Ok(pool.get()?.execute(sql, params![user_id, stored])? > 0)
}

/// `None` follows the server's metadata country again.
pub fn set_ratings_country(pool: &Pool, user_id: &str, country: Option<&str>) -> Result<bool> {
    let sql = "UPDATE users SET ratings_country = ?2 WHERE id = ?1";
    Ok(pool.get()?.execute(sql, params![user_id, country])? > 0)
}

/// What each named item is held to, skipping ids nothing matches. An episode
/// is held to its show's ratings, never to its own.
pub fn items_access(pool: &Pool, ids: &[String]) -> Result<HashMap<String, TitleAccess>> {
    let sql = |ph: &str| {
        format!(
            "SELECT i.id, i.library, CASE WHEN i.kind = 'episode' THEN s.metadata ELSE i.metadata END \
             FROM items i LEFT JOIN shows s ON s.id = i.show_id WHERE i.id IN ({ph})"
        )
    };
    access_of(pool, ids, sql)
}

pub fn shows_access(pool: &Pool, ids: &[String]) -> Result<HashMap<String, TitleAccess>> {
    access_of(pool, ids, |ph| {
        format!("SELECT id, library, metadata FROM shows WHERE id IN ({ph})")
    })
}

/// [`items_access`] then [`shows_access`]: an id that names both answers as
/// the item, as the library grant reads a saved subject.
pub fn subjects_access(pool: &Pool, ids: &[String]) -> Result<HashMap<String, TitleAccess>> {
    let mut found = items_access(pool, ids)?;
    let rest: Vec<String> = ids
        .iter()
        .filter(|id| !found.contains_key(*id))
        .cloned()
        .collect();
    found.extend(shows_access(pool, &rest)?);
    Ok(found)
}

/// Every film and every show, by id: the titles a ceiling is weighed against
/// when a whole catalogue is searched. Episodes are left out, as their show
/// answers for them.
pub fn every_title_access(pool: &Pool) -> Result<HashMap<String, TitleAccess>> {
    let conn = pool.get()?;
    let mut out = HashMap::new();
    for sql in [
        "SELECT id, library, metadata FROM items WHERE kind != 'episode'",
        "SELECT id, library, metadata FROM shows",
    ] {
        keep_first(&mut out, read_access(&conn, sql, [])?);
    }
    Ok(out)
}

fn access_of(
    pool: &Pool,
    ids: &[String],
    sql: impl Fn(&str) -> String,
) -> Result<HashMap<String, TitleAccess>> {
    let mut out = HashMap::with_capacity(ids.len());
    if ids.is_empty() {
        return Ok(out);
    }
    let conn = pool.get()?;
    for chunk in ids.chunks(IN_CHUNK) {
        let ph = vec!["?"; chunk.len()].join(",");
        let found = read_access(&conn, &sql(&ph), rusqlite::params_from_iter(chunk))?;
        keep_first(&mut out, found);
    }
    Ok(out)
}

fn read_access(
    conn: &Connection,
    sql: &str,
    bound: impl rusqlite::Params,
) -> Result<Vec<(String, TitleAccess)>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(bound, |r| {
        let blob = r.get::<_, Option<String>>(2)?;
        Ok((r.get::<_, String>(0)?, access(r.get(1)?, blob.as_deref())))
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn keep_first(out: &mut HashMap<String, TitleAccess>, found: Vec<(String, TitleAccess)>) {
    for (id, title) in found {
        out.entry(id).or_insert(title);
    }
}

#[derive(serde::Deserialize, Default)]
struct StoredRating {
    #[serde(default)]
    ratings: CountryRatings,
    #[serde(default)]
    certification: Option<String>,
}

fn access(library: String, blob: Option<&str>) -> TitleAccess {
    let stored: StoredRating = blob
        .and_then(|blob| serde_json::from_str(blob).ok())
        .unwrap_or_default();
    TitleAccess {
        library,
        ratings: stored.ratings,
        certification: stored.certification,
    }
}

fn level_at_most(age: i64) -> MaturityLevel {
    MaturityLevel::ALL
        .into_iter()
        .rev()
        .find(|level| i64::from(level.age()) <= age)
        .unwrap_or(MaturityLevel::All)
}

#[cfg(test)]
mod tests;
