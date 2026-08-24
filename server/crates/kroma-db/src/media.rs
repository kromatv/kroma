//! Catalog reads: counts, movie/item listings and single-item fetches.
//!
//! Re-exported flat here so the public `db::<item>` paths resolve unchanged:
//! [`shows`] carries the show listing, [`show_detail`] one show with its
//! seasons, and [`splash`] the anonymous sign-in sample.

use rusqlite::OptionalExtension;

use super::*;
use kroma_domain::{Season, Show, ShowDetail, SplashEntry};

mod show_detail;
mod shows;
mod splash;

#[cfg(test)]
mod test_support;

pub use show_detail::*;
pub use shows::*;
pub use splash::*;

/// (libraries, items, shows) counts for `/api/health`.
pub fn counts(pool: &Pool) -> Result<(usize, usize, usize)> {
    let conn = pool.get()?;
    let libs: i64 = conn.query_row("SELECT COUNT(*) FROM libraries", [], |r| r.get(0))?;
    let items: i64 = conn.query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0))?;
    let shows: i64 = conn.query_row("SELECT COUNT(*) FROM shows", [], |r| r.get(0))?;
    Ok((libs as usize, items as usize, shows as usize))
}

/// Movies (and loose videos) everything that isn't an episode.
pub fn list_movies(pool: &Pool, library: Option<&str>) -> Result<Vec<MediaItem>> {
    query_items(
        pool,
        &format!("SELECT {ITEM_COLS} FROM items WHERE kind != 'episode'"),
        library,
        "ORDER BY title COLLATE NOCASE",
    )
}

/// All playable items: movies + episodes.
pub fn list_items(pool: &Pool, library: Option<&str>) -> Result<Vec<MediaItem>> {
    query_items(
        pool,
        &format!("SELECT {ITEM_COLS} FROM items"),
        library,
        "ORDER BY title COLLATE NOCASE",
    )
}

pub fn get_item(pool: &Pool, id: &str) -> Result<Option<MediaItem>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(&format!("SELECT {ITEM_COLS} FROM items WHERE id = ?1"))?;
    let mut rows = stmt.query_map(params![id], row_to_item)?;
    match rows.next() {
        Some(item) => {
            let mut item = item?;
            attach_files(&conn, &mut item)?;
            Ok(Some(item))
        }
        None => Ok(None),
    }
}

/// Catalogue snapshot for the search index: no per-row file or
/// representative-video lookups, so a full reindex is two table scans.
pub fn index_snapshot(pool: &Pool) -> Result<(Vec<MediaItem>, Vec<Show>)> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(&format!("SELECT {ITEM_COLS} FROM items"))?;
    let items: Vec<MediaItem> = stmt
        .query_map([], row_to_item)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut stmt = conn.prepare("SELECT id,title,year,library,added_at,metadata FROM shows")?;
    let shows: Vec<Show> = stmt
        .query_map([], row_to_show_bare)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok((items, shows))
}

/// Order is unspecified the caller re-orders by relevance.
pub fn get_items_by_ids(pool: &Pool, ids: &[String]) -> Result<Vec<MediaItem>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let conn = pool.get()?;
    let ids: Vec<&str> = ids.iter().map(String::as_str).collect();
    Ok(items_by_ids_ordered(&conn, &ids)?)
}

/// `(movie_ids, show_ids)` crediting `name` in cast or crew, matched
/// case-insensitively. Episodes are excluded: they inherit a show's credits.
pub fn titles_by_person(pool: &Pool, name: &str) -> Result<(Vec<String>, Vec<String>)> {
    let name = name.trim();
    if name.is_empty() {
        return Ok((Vec::new(), Vec::new()));
    }
    let conn = pool.get()?;
    let movie_ids = person_ids(
        &conn,
        "SELECT id FROM items WHERE kind != 'episode' AND metadata IS NOT NULL AND (",
        name,
    )?;
    let show_ids = person_ids(
        &conn,
        "SELECT id FROM shows WHERE metadata IS NOT NULL AND (",
        name,
    )?;
    Ok((movie_ids, show_ids))
}

fn person_ids(conn: &rusqlite::Connection, prefix: &str, name: &str) -> Result<Vec<String>> {
    let sql = format!(
        "{prefix} \
         EXISTS (SELECT 1 FROM json_each(metadata,'$.cast') c WHERE json_extract(c.value,'$.name') = ?1 COLLATE NOCASE) OR \
         EXISTS (SELECT 1 FROM json_each(metadata,'$.crew') c WHERE json_extract(c.value,'$.name') = ?1 COLLATE NOCASE))"
    );
    let mut stmt = conn.prepare(&sql)?;
    let ids = stmt
        .query_map(params![name], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(ids)
}

fn query_items(
    pool: &Pool,
    base: &str,
    library: Option<&str>,
    tail: &str,
) -> Result<Vec<MediaItem>> {
    let conn = pool.get()?;
    let mut items: Vec<MediaItem> = match library {
        Some(lib) => {
            let sql = format!(
                "{base} {} {tail}",
                if base.contains("WHERE") {
                    "AND library = ?1"
                } else {
                    "WHERE library = ?1"
                }
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map(params![lib], row_to_item)?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        }
        None => {
            let sql = format!("{base} {tail}");
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map([], row_to_item)?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        }
    };
    attach_files_batch(&conn, &mut items)?;
    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media::test_support::*;
    use kroma_domain::Kind;

    #[test]
    fn counts_reflects_seeded_rows() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            seed_movie(&conn, "m1", "Dune", "lib");
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Show','t')",
                [],
            )
            .unwrap();
        }
        assert_eq!(counts(&p).unwrap(), (1, 1, 1));
    }

    #[test]
    fn list_movies_and_items_ordering_and_episode_split() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib2','L2','movies','/y','t')",
                [],
            )
            .unwrap();
            seed_movie(&conn, "m1", "Dune", "lib");
            seed_movie(&conn, "m2", "Arrival", "lib");
            seed_movie(&conn, "mo", "Other", "lib2");
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Show','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
                 VALUES ('e1','episode','Ep','mkv','lib','s1',1,1,'t')",
                [],
            )
            .unwrap();
        }
        let movies = list_movies(&p, None).unwrap();
        assert_eq!(
            movies.iter().map(|i| i.id.as_str()).collect::<Vec<_>>(),
            ["m2", "m1", "mo"]
        );
        assert!(movies.iter().all(|i| i.kind != Kind::Episode));

        let lib_movies = list_movies(&p, Some("lib")).unwrap();
        assert_eq!(
            lib_movies.iter().map(|i| i.id.as_str()).collect::<Vec<_>>(),
            ["m2", "m1"]
        );

        let items = list_items(&p, None).unwrap();
        assert!(items.iter().any(|i| i.id == "e1"));
        assert_eq!(items.len(), 4);
    }

    #[test]
    fn get_item_hydrates_representative_file() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            seed_movie(&conn, "m1", "Dune", "lib");
            seed_probed_file(&conn, "f1", "m1", "/media/dune.mkv", 3840);
        }
        let item = get_item(&p, "m1").unwrap().unwrap();
        assert_eq!(item.default_file_id.as_deref(), Some("f1"));
        assert_eq!(item.abs_path.as_deref(), Some("/media/dune.mkv"));
        assert_eq!(item.container, "mkv");
        assert_eq!(item.duration_ms, Some(7_200_000));
        let video = item.video.expect("probed file yields a video stream");
        assert_eq!(video.codec, "hevc");
        assert_eq!(video.width, Some(3840));
        assert_eq!(item.files.len(), 1);

        assert!(get_item(&p, "missing").unwrap().is_none());
    }

    #[test]
    fn by_ids_and_index_snapshot() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            seed_movie(&conn, "m1", "Dune", "lib");
            seed_movie(&conn, "m2", "Arrival", "lib");
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Show','t')",
                [],
            )
            .unwrap();
        }
        assert!(get_items_by_ids(&p, &[]).unwrap().is_empty());
        assert!(get_shows_by_ids(&p, &[]).unwrap().is_empty());

        let items = get_items_by_ids(&p, &["m2".into(), "m1".into(), "ghost".into()]).unwrap();
        let mut ids: Vec<&str> = items.iter().map(|i| i.id.as_str()).collect();
        ids.sort();
        assert_eq!(ids, ["m1", "m2"]);

        let shows = get_shows_by_ids(&p, &["s1".into()]).unwrap();
        assert_eq!(shows.len(), 1);
        assert_eq!(shows[0].id, "s1");

        let (items, shows) = index_snapshot(&p).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(shows.len(), 1);
    }

    const SQLITE_BIND_LIMIT: usize = 32_766;

    fn padded_past_the_bind_limit(real: &str) -> Vec<String> {
        let mut ids: Vec<String> = (0..=SQLITE_BIND_LIMIT)
            .map(|n| format!("absent{n}"))
            .collect();
        ids.push(real.to_string());
        ids
    }

    #[test]
    fn a_by_ids_read_longer_than_sqlite_can_bind_still_answers() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            seed_movie(&conn, "m1", "Dune", "lib");
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Show','t')",
                [],
            )
            .unwrap();
        }

        let items = get_items_by_ids(&p, &padded_past_the_bind_limit("m1")).unwrap();
        let shows = get_shows_by_ids(&p, &padded_past_the_bind_limit("s1")).unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "m1");
        assert_eq!(shows.len(), 1);
        assert_eq!(shows[0].id, "s1");
    }
}
