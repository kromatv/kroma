//! The catalogue as an import looks a title of another server up in it: by
//! the path of a file, by the ids other catalogues give it, and by its name.

use std::collections::HashMap;

use rusqlite::{params, params_from_iter, OptionalExtension, ToSql};

use crate::{Pool, Result, IN_CHUNK};

/// The item each of `paths` is a file of, by path. A path no file has is
/// absent.
pub fn items_by_file(pool: &Pool, paths: &[&str]) -> Result<HashMap<String, String>> {
    let conn = pool.get()?;
    let mut found = HashMap::new();
    for chunk in paths.chunks(IN_CHUNK) {
        let placeholders = vec!["?"; chunk.len()].join(",");
        let mut stmt = conn.prepare(&format!(
            "SELECT abs_path, item_id FROM files WHERE abs_path IN ({placeholders})"
        ))?;
        let rows = stmt.query_map(params_from_iter(chunk.iter()), |r| {
            Ok((r.get(0)?, r.get(1)?))
        })?;
        for row in rows {
            let (path, item) = row?;
            found.insert(path, item);
        }
    }
    Ok(found)
}

/// The ids other catalogues give one title, as this server stores them.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct CatalogueIds<'a> {
    pub tmdb: Option<i64>,
    pub imdb: Option<&'a str>,
    pub tvdb: Option<i64>,
}

const FILMS: &str = "items t ON t.id = c.subject_id AND t.kind IN ('movie', 'video') \
    WHERE c.subject_kind = 'item'";

const SHOWS: &str = "shows t ON t.id = c.subject_id WHERE c.subject_kind = 'show'";

fn by_ids(pool: &Pool, subjects: &str, ids: &CatalogueIds<'_>) -> Result<Option<String>> {
    let conn = pool.get()?;
    let asked: [(&str, Option<&dyn ToSql>); 3] = [
        ("tmdb_id", ids.tmdb.as_ref().map(|id| id as &dyn ToSql)),
        ("imdb_id", ids.imdb.as_ref().map(|id| id as &dyn ToSql)),
        ("tvdb_id", ids.tvdb.as_ref().map(|id| id as &dyn ToSql)),
    ];
    for (column, id) in asked {
        let Some(id) = id else {
            continue;
        };
        let sql = format!(
            "SELECT t.id FROM metadata_core c JOIN {subjects} AND c.{column} = ?1 \
             ORDER BY t.id LIMIT 1"
        );
        let found: Option<String> = conn.query_row(&sql, [id], |r| r.get(0)).optional()?;
        if found.is_some() {
            return Ok(found);
        }
    }
    Ok(None)
}

/// The film one of `ids` names. TMDB's id is asked first, then IMDb's, then
/// TheTVDB's, and the first film in id order answers where several match.
pub fn film_by_ids(pool: &Pool, ids: &CatalogueIds<'_>) -> Result<Option<String>> {
    by_ids(pool, FILMS, ids)
}

/// The show one of `ids` names, asked as [`film_by_ids`] asks.
pub fn show_by_ids(pool: &Pool, ids: &CatalogueIds<'_>) -> Result<Option<String>> {
    by_ids(pool, SHOWS, ids)
}

/// One episode of a show, by its numbers.
#[derive(Debug, Clone, Copy)]
pub struct EpisodeOf<'a> {
    pub show: &'a str,
    pub season: u32,
    pub episode: u32,
}

/// The item that holds an episode, a file of several episodes included.
pub fn episode_item(pool: &Pool, episode: &EpisodeOf<'_>) -> Result<Option<String>> {
    let found = pool
        .get()?
        .query_row(
            "SELECT id FROM items WHERE kind = 'episode' AND show_id = ?1 AND season = ?2 \
               AND ?3 BETWEEN episode AND COALESCE(episode_end, episode) \
             ORDER BY episode, id LIMIT 1",
            params![episode.show, episode.season, episode.episode],
            |r| r.get(0),
        )
        .optional()?;
    Ok(found)
}

/// A film or a show by the name and the year a scan read for it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Named {
    pub id: String,
    pub title: String,
    pub year: Option<u32>,
}

fn named(pool: &Pool, sql: &str, year: Option<u32>) -> Result<Vec<Named>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params_from_iter(year), |r| {
        Ok(Named {
            id: r.get(0)?,
            title: r.get(1)?,
            year: r.get(2)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Every film of `year`, in id order.
pub fn films_of_year(pool: &Pool, year: u32) -> Result<Vec<Named>> {
    let films = "SELECT id, title, year FROM items \
                 WHERE kind IN ('movie', 'video') AND year = ?1 ORDER BY id";
    named(pool, films, Some(year))
}

/// Every show, in id order.
pub fn shows_by_name(pool: &Pool) -> Result<Vec<Named>> {
    named(pool, "SELECT id, title, year FROM shows ORDER BY id", None)
}
