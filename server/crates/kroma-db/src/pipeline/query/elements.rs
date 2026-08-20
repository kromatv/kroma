//! The lean rows the elements list renders, and the titles behind their ids.

use std::collections::HashMap;

use anyhow::Result;

use crate::pool::Pool;

/// Lean item row for the elements list: only the columns the view needs, with
/// poster/genre/has-metadata pulled out of the JSON via `json_extract` so we
/// never deserialize the full (heavy) TMDB metadata blob per item.
pub struct RawItem {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub year: Option<i64>,
    pub duration_ms: Option<i64>,
    pub show_id: Option<String>,
    pub show_title: Option<String>,
    pub season: Option<i64>,
    pub episode: Option<i64>,
    pub episode_title: Option<String>,
    pub has_meta: bool,
    pub poster: Option<String>,
    pub genre: Option<String>,
}

pub struct RawShow {
    pub id: String,
    pub title: String,
    pub year: Option<i64>,
    pub has_meta: bool,
    pub poster: Option<String>,
    pub genre: Option<String>,
}

/// All items, lean (no full-metadata parse). One query.
pub fn raw_items(pool: &Pool) -> Result<Vec<RawItem>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id,kind,title,year,duration_ms,show_id,show_title,season,episode,episode_title,\
           (metadata IS NOT NULL), json_extract(metadata,'$.posterUrl'), json_extract(metadata,'$.genres[0]') \
         FROM items",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(RawItem {
            id: r.get(0)?,
            kind: r.get(1)?,
            title: r.get(2)?,
            year: r.get(3)?,
            duration_ms: r.get(4)?,
            show_id: r.get(5)?,
            show_title: r.get(6)?,
            season: r.get(7)?,
            episode: r.get(8)?,
            episode_title: r.get(9)?,
            has_meta: r.get::<_, i64>(10)? != 0,
            poster: r.get(11)?,
            genre: r.get(12)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// All shows, lean. One query.
pub fn raw_shows(pool: &Pool) -> Result<Vec<RawShow>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id,title,year,(metadata IS NOT NULL), \
           json_extract(metadata,'$.posterUrl'), json_extract(metadata,'$.genres[0]') FROM shows",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(RawShow {
            id: r.get(0)?,
            title: r.get(1)?,
            year: r.get(2)?,
            has_meta: r.get::<_, i64>(3)? != 0,
            poster: r.get(4)?,
            genre: r.get(5)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Titles for a set of item ids, one query (ids without a row are simply absent
/// from the map). Batch resolver for the failed-task drill-down.
pub fn item_titles(pool: &Pool, ids: &[String]) -> Result<HashMap<String, String>> {
    titles_in(pool, "items", ids)
}

/// Titles for a set of show ids, one query. Batch resolver for the failed-task
/// drill-down (metadata/embed subjects are item-kind but their id may be a show).
pub fn show_titles(pool: &Pool, ids: &[String]) -> Result<HashMap<String, String>> {
    titles_in(pool, "shows", ids)
}

// `id -> title` for the given ids from `table` (a fixed `"items"`/`"shows"`,
// never user input), one `IN (...)` query per chunk. Empty ids yields an empty
// map.
fn titles_in(pool: &Pool, table: &str, ids: &[String]) -> Result<HashMap<String, String>> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let conn = pool.get()?;
    let mut titles = HashMap::with_capacity(ids.len());
    for chunk in ids.chunks(crate::IN_CHUNK) {
        let placeholders = vec!["?"; chunk.len()].join(",");
        let sql = format!("SELECT id, title FROM {table} WHERE id IN ({placeholders})");
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(chunk.iter()), |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (id, title) = row?;
            titles.insert(id, title);
        }
    }
    Ok(titles)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::query::test_support::*;

    #[test]
    fn raw_rows_and_title_lookups() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute("INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')", []).unwrap();
            conn.execute(
                "INSERT INTO items (id,kind,title,year,container,library,added_at,metadata) \
                 VALUES ('m1','movie','Dune',2021,'mkv','lib','t','{\"posterUrl\":\"/p.webp\",\"genres\":[\"Horror\",\"Thriller\"]}')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m2','movie','Bare','mkv','lib','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at,metadata) VALUES ('s1','lib','Show','t','{\"posterUrl\":\"/s.webp\",\"genres\":[\"Drama\"]}')",
                [],
            )
            .unwrap();
        }
        let items = raw_items(&p).unwrap();
        let m1 = items.iter().find(|i| i.id == "m1").unwrap();
        assert!(m1.has_meta);
        assert_eq!(m1.poster.as_deref(), Some("/p.webp"));
        assert_eq!(m1.genre.as_deref(), Some("Horror"));
        assert_eq!(m1.year, Some(2021));
        let m2 = items.iter().find(|i| i.id == "m2").unwrap();
        assert!(!m2.has_meta);
        assert!(m2.poster.is_none());

        let shows = raw_shows(&p).unwrap();
        assert_eq!(shows.len(), 1);
        assert!(shows[0].has_meta);
        assert_eq!(shows[0].genre.as_deref(), Some("Drama"));

        let titles = item_titles(&p, &["m1".into(), "ghost".into()]).unwrap();
        assert_eq!(titles.get("m1").map(String::as_str), Some("Dune"));
        assert_eq!(titles.len(), 1);
        assert_eq!(show_titles(&p, &["s1".into()]).unwrap().get("s1").map(String::as_str), Some("Show"));
        assert!(item_titles(&p, &[]).unwrap().is_empty());
    }

    #[test]
    fn a_title_lookup_longer_than_sqlite_can_bind_still_answers() {
        const SQLITE_BIND_LIMIT: usize = 32_766;
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute("INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')", []).unwrap();
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m1','movie','Dune','mkv','lib','t')",
                [],
            )
            .unwrap();
        }
        let mut ids: Vec<String> = (0..=SQLITE_BIND_LIMIT).map(|n| format!("absent{n}")).collect();
        ids.push("m1".to_string());

        let titles = item_titles(&p, &ids).unwrap();

        assert_eq!(titles.get("m1").map(String::as_str), Some("Dune"));
        assert_eq!(titles.len(), 1);
    }
}
