//! Catalog reads: counts, movie/item/show listings and single-item/show fetches.

use super::*;

use kroma_domain::{Season, Show, ShowDetail, SplashEntry};

// Callers append their own `WHERE`/`ORDER BY` and map rows with `row_to_show_counted`.
const SHOWS_COUNTED_SELECT: &str = "SELECT s.id,s.title,s.year,s.library,s.added_at,\
    (SELECT COUNT(DISTINCT i.season) FROM items i WHERE i.show_id=s.id),\
    (SELECT COUNT(*) FROM items i WHERE i.show_id=s.id),\
    s.metadata \
 FROM shows s";

fn row_to_show_counted(r: &Row) -> rusqlite::Result<Show> {
    Ok(Show {
        id: r.get(0)?,
        title: r.get(1)?,
        year: r.get(2)?,
        library: r.get(3)?,
        added_at: r.get(4)?,
        season_count: r.get::<_, i64>(5)? as u32,
        episode_count: r.get::<_, i64>(6)? as u32,
        video: None,
        metadata: parse_metadata(r.get(7)?),
        progress: None,
    })
}

// Season/episode counts come back zeroed; the caller fills them in.
fn row_to_show_bare(r: &Row) -> rusqlite::Result<Show> {
    Ok(Show {
        id: r.get(0)?,
        title: r.get(1)?,
        year: r.get(2)?,
        library: r.get(3)?,
        added_at: r.get(4)?,
        season_count: 0,
        episode_count: 0,
        video: None,
        metadata: parse_metadata(r.get(5)?),
        progress: None,
    })
}

// `base` is the index of `v_codec`; the five stream columns follow it in order.
fn row_to_video_at(r: &Row, base: usize) -> rusqlite::Result<VideoStream> {
    Ok(VideoStream {
        codec: r.get::<_, String>(base)?,
        width: r.get(base + 1)?,
        height: r.get(base + 2)?,
        hdr: r.get::<_, Option<i64>>(base + 3)?.unwrap_or(0) != 0,
        bit_depth: r.get(base + 4)?,
    })
}

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

pub fn list_shows(pool: &Pool, library: Option<&str>) -> Result<Vec<Show>> {
    let conn = pool.get()?;
    let (where_sql, want_lib) = match library {
        Some(_) => ("WHERE s.library = ?1", true),
        None => ("", false),
    };
    let sql = format!("{SHOWS_COUNTED_SELECT} {where_sql} ORDER BY s.title COLLATE NOCASE");
    let mut stmt = conn.prepare(&sql)?;

    let mut shows: Vec<Show> = if want_lib {
        stmt.query_map(params![library.unwrap()], row_to_show_counted)?
            .collect::<rusqlite::Result<Vec<_>>>()?
    } else {
        stmt.query_map([], row_to_show_counted)?.collect::<rusqlite::Result<Vec<_>>>()?
    };

    apply_representative_videos(&conn, &mut shows)?;
    Ok(shows)
}

/// Catalogue snapshot for the search index: no per-row file or
/// representative-video lookups, so a full reindex is two table scans.
pub fn index_snapshot(pool: &Pool) -> Result<(Vec<MediaItem>, Vec<Show>)> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(&format!("SELECT {ITEM_COLS} FROM items"))?;
    let items: Vec<MediaItem> =
        stmt.query_map([], row_to_item)?.collect::<rusqlite::Result<Vec<_>>>()?;
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
    let placeholders = vec!["?"; ids.len()].join(",");
    let sql = format!("SELECT {ITEM_COLS} FROM items WHERE id IN ({placeholders})");
    let mut stmt = conn.prepare(&sql)?;
    let mut items: Vec<MediaItem> = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), row_to_item)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    attach_files_batch(&conn, &mut items)?;
    Ok(items)
}

/// Order is unspecified the caller re-orders by relevance.
pub fn get_shows_by_ids(pool: &Pool, ids: &[String]) -> Result<Vec<Show>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let conn = pool.get()?;
    let placeholders = vec!["?"; ids.len()].join(",");
    let sql = format!("{SHOWS_COUNTED_SELECT} WHERE s.id IN ({placeholders})");
    let mut stmt = conn.prepare(&sql)?;
    let mut shows: Vec<Show> = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), row_to_show_counted)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    apply_representative_videos(&conn, &mut shows)?;
    Ok(shows)
}

/// `(movie_ids, show_ids)` crediting `name` in cast or crew, matched
/// case-insensitively. Episodes are excluded: they inherit a show's credits.
pub fn titles_by_person(pool: &Pool, name: &str) -> Result<(Vec<String>, Vec<String>)> {
    let name = name.trim();
    if name.is_empty() {
        return Ok((Vec::new(), Vec::new()));
    }
    let conn = pool.get()?;
    let movie_ids =
        person_ids(&conn, "SELECT id FROM items WHERE kind != 'episode' AND metadata IS NOT NULL AND (", name)?;
    let show_ids = person_ids(&conn, "SELECT id FROM shows WHERE metadata IS NOT NULL AND (", name)?;
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

pub fn show_title(pool: &Pool, id: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    Ok(conn
        .query_row("SELECT title FROM shows WHERE id = ?1", params![id], |r| r.get(0))
        .ok())
}

/// `metadata.posterUrl`, when enrichment found one.
pub fn show_poster_art(pool: &Pool, id: &str) -> Result<Option<String>> {
    Ok(show_metadata(pool, id)?.and_then(|m| m.poster_url))
}

/// The show's full enrichment metadata, when one is stored.
pub fn show_metadata(pool: &Pool, id: &str) -> Result<Option<Metadata>> {
    let conn = pool.get()?;
    let raw: Option<Option<String>> = conn
        .query_row("SELECT metadata FROM shows WHERE id = ?1", params![id], |r| r.get(0))
        .ok();
    Ok(parse_metadata(raw.flatten()))
}

pub fn get_show(pool: &Pool, id: &str) -> Result<Option<ShowDetail>> {
    let conn = pool.get()?;
    let show = conn
        .query_row(
            "SELECT id,title,year,library,added_at,metadata FROM shows WHERE id = ?1",
            params![id],
            row_to_show_bare,
        )
        .ok();

    let Some(mut show) = show else { return Ok(None) };

    let mut stmt = conn.prepare(&format!(
        "SELECT {ITEM_COLS} FROM items WHERE show_id = ?1 \
         ORDER BY season, episode",
    ))?;
    let mut episodes: Vec<MediaItem> = stmt
        .query_map(params![id], row_to_item)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    attach_files_batch(&conn, &mut episodes)?;

    let mut seasons: Vec<Season> = Vec::new();
    for ep in episodes.iter().cloned() {
        let n = ep.season.unwrap_or(0);
        match seasons.iter_mut().find(|s| s.number == n) {
            Some(s) => s.episodes.push(ep),
            None => seasons.push(Season { number: n, episodes: vec![ep], cast: Vec::new() }),
        }
    }
    seasons.sort_by_key(|s| s.number);

    let mut casts = season_casts(pool, id)?;
    for s in &mut seasons {
        if let Some(cast) = casts.remove(&s.number) {
            s.cast = cast;
        }
    }

    show.episode_count = episodes.len() as u32;
    show.season_count = seasons.len() as u32;
    show.video = representative_video(&conn, id)?;

    Ok(Some(ShowDetail { show, seasons }))
}

// Rows arrive widest-first, so the first row seen per show wins exactly the
// per-show `ORDER BY v_width DESC LIMIT 1` the single-show query does.
fn apply_representative_videos(conn: &rusqlite::Connection, shows: &mut [Show]) -> Result<()> {
    if shows.is_empty() {
        return Ok(());
    }
    use std::collections::HashMap;
    let ids: Vec<&str> = shows.iter().map(|s| s.id.as_str()).collect();
    let mut best: HashMap<String, VideoStream> = HashMap::new();
    for chunk in ids.chunks(super::IN_CHUNK) {
        let ph = vec!["?"; chunk.len()].join(",");
        let mut stmt = conn.prepare(&format!(
            "SELECT i.show_id,f.v_codec,f.v_width,f.v_height,f.v_hdr,f.v_bit_depth \
             FROM files f JOIN items i ON f.item_id = i.id \
             WHERE i.show_id IN ({ph}) AND f.probed = 1 AND f.v_codec IS NOT NULL \
             ORDER BY f.v_width DESC NULLS LAST",
        ))?;
        let rows = stmt.query_map(rusqlite::params_from_iter(chunk.iter()), |r| {
            Ok((r.get::<_, String>(0)?, row_to_video_at(r, 1)?))
        })?;
        for row in rows {
            let (show_id, video) = row?;
            best.entry(show_id).or_insert(video);
        }
    }
    for s in shows.iter_mut() {
        s.video = best.remove(&s.id);
    }
    Ok(())
}

fn representative_video(conn: &rusqlite::Connection, show_id: &str) -> Result<Option<VideoStream>> {
    let mut stmt = conn.prepare(
        "SELECT f.v_codec,f.v_width,f.v_height,f.v_hdr,f.v_bit_depth \
         FROM files f JOIN items i ON f.item_id = i.id \
         WHERE i.show_id = ?1 AND f.probed = 1 AND f.v_codec IS NOT NULL \
         ORDER BY f.v_width DESC NULLS LAST LIMIT 1",
    )?;
    let mut rows = stmt.query_map(params![show_id], |r| row_to_video_at(r, 0))?;
    match rows.next() {
        Some(v) => Ok(Some(v?)),
        None => Ok(None),
    }
}

fn query_items(pool: &Pool, base: &str, library: Option<&str>, tail: &str) -> Result<Vec<MediaItem>> {
    let conn = pool.get()?;
    let mut items: Vec<MediaItem> = match library {
        Some(lib) => {
            let sql = format!("{base} {} {tail}", if base.contains("WHERE") { "AND library = ?1" } else { "WHERE library = ?1" });
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


/// A random sample of backdrop-carrying titles for the anonymous sign-in
/// splash, captions overlaid in `locale`. A fixed-size random sample, never a
/// listing: the one catalogue read served without a session.
pub fn splash_entries(pool: &Pool, limit: u32, locale: &str) -> Result<Vec<SplashEntry>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        // The scan only knows a year when the file name carried one (shows
        // rarely do); the enriched release date fills the gap.
        "SELECT kind, id, title, year, backdrop_url, rating FROM (\
            SELECT 'movie' AS kind, i.id AS id, i.title AS title, \
                   COALESCE(i.year, NULLIF(CAST(substr(mc.release_date,1,4) AS INTEGER),0)) AS year, \
                   mc.backdrop_url AS backdrop_url, mc.rating AS rating \
              FROM items i JOIN metadata_core mc \
                ON mc.subject_kind='item' AND mc.subject_id=i.id \
             WHERE i.kind='movie' AND mc.backdrop_url IS NOT NULL \
            UNION ALL \
            SELECT 'show', s.id, s.title, \
                   COALESCE(s.year, NULLIF(CAST(substr(mc.release_date,1,4) AS INTEGER),0)), \
                   mc.backdrop_url, mc.rating \
              FROM shows s JOIN metadata_core mc \
                ON mc.subject_kind='show' AND mc.subject_id=s.id \
             WHERE mc.backdrop_url IS NOT NULL) \
         ORDER BY RANDOM() LIMIT ?1",
    )?;
    let mut entries: Vec<(String, SplashEntry)> = stmt
        .query_map([limit], |r| {
            Ok((
                r.get::<_, String>(1)?,
                SplashEntry {
                    kind: r.get(0)?,
                    title: r.get(2)?,
                    year: r.get(3)?,
                    backdrop_url: r.get(4)?,
                    rating: r.get(5)?,
                },
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;

    for (subject, kind) in [(metadata_core::ITEM, "movie"), (metadata_core::SHOW, "show")] {
        let ids: Vec<&str> =
            entries.iter().filter(|(_, e)| e.kind == kind).map(|(id, _)| id.as_str()).collect();
        let tr = translations::resolve_many(&conn, subject, &ids, locale)?;
        for (id, entry) in entries.iter_mut() {
            if entry.kind == kind {
                if let Some(title) = tr.get(id).and_then(|d| d.title.clone()) {
                    entry.title = title;
                }
            }
        }
    }
    Ok(entries.into_iter().map(|(_, e)| e).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempPool;
    use kroma_domain::{CastMember, Kind};

    fn pool() -> TempPool {
        crate::testing::temp_pool("media")
    }

    fn seed_movie(conn: &Connection, id: &str, title: &str, library: &str) {
        conn.execute(
            "INSERT INTO items (id,kind,title,container,library,added_at) \
             VALUES (?1,'movie',?2,'mkv',?3,'t')",
            params![id, title, library],
        )
        .unwrap();
    }

    fn seed_probed_file(conn: &Connection, id: &str, item_id: &str, abs: &str, v_width: i64) {
        conn.execute(
            "INSERT INTO files (id,item_id,abs_path,rel_path,container,probed,duration_ms,v_codec,v_width,v_height) \
             VALUES (?1,?2,?3,?4,'mkv',1,7200000,'hevc',?5,2160)",
            params![id, item_id, abs, format!("{item_id}.mkv"), v_width],
        )
        .unwrap();
    }

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
        assert_eq!(movies.iter().map(|i| i.id.as_str()).collect::<Vec<_>>(), ["m2", "m1", "mo"]);
        assert!(movies.iter().all(|i| i.kind != Kind::Episode));

        let lib_movies = list_movies(&p, Some("lib")).unwrap();
        assert_eq!(lib_movies.iter().map(|i| i.id.as_str()).collect::<Vec<_>>(), ["m2", "m1"]);

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
    fn list_shows_counts_and_representative_video() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','shows','/x','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO shows (id,library,title,year,added_at) VALUES ('s1','lib','Severance',2022,'t')",
                [],
            )
            .unwrap();
            for (id, s, e) in [("e1", 1, 1), ("e2", 1, 2), ("e3", 2, 1)] {
                conn.execute(
                    "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
                     VALUES (?1,'episode','Ep','mkv','lib','s1',?2,?3,'t')",
                    params![id, s, e],
                )
                .unwrap();
            }
            seed_probed_file(&conn, "f-e1", "e1", "/media/e1.mkv", 1920);
        }
        let shows = list_shows(&p, None).unwrap();
        assert_eq!(shows.len(), 1);
        let s = &shows[0];
        assert_eq!(s.season_count, 2);
        assert_eq!(s.episode_count, 3);
        assert_eq!(s.video.as_ref().map(|v| v.width), Some(Some(1920)));
        assert_eq!(list_shows(&p, Some("lib")).unwrap().len(), 1);
        assert!(list_shows(&p, Some("nope")).unwrap().is_empty());
    }

    #[test]
    fn get_show_groups_seasons_and_attaches_cast() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','shows','/x','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Show','t')",
                [],
            )
            .unwrap();
            for (id, s, e) in [("e1", 1, 1), ("e2", 1, 2), ("e3", 2, 1)] {
                conn.execute(
                    "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
                     VALUES (?1,'episode','Ep','mkv','lib','s1',?2,?3,'t')",
                    params![id, s, e],
                )
                .unwrap();
            }
        }
        crate::set_season_cast(
            &p,
            "s1",
            1,
            &[CastMember { name: "Adam".into(), character: Some("Mark".into()), profile_url: None }],
        )
        .unwrap();

        let detail = get_show(&p, "s1").unwrap().unwrap();
        assert_eq!(detail.show.season_count, 2);
        assert_eq!(detail.show.episode_count, 3);
        assert_eq!(detail.seasons.len(), 2);
        assert_eq!(detail.seasons[0].number, 1);
        assert_eq!(detail.seasons[0].episodes.len(), 2);
        assert_eq!(detail.seasons[0].cast.len(), 1);
        assert_eq!(detail.seasons[0].cast[0].name, "Adam");
        assert_eq!(detail.seasons[1].number, 2);
        assert_eq!(detail.seasons[1].episodes.len(), 1);
        assert!(detail.seasons[1].cast.is_empty());

        assert!(get_show(&p, "missing").unwrap().is_none());
        assert_eq!(show_title(&p, "s1").unwrap().as_deref(), Some("Show"));
        assert!(show_title(&p, "missing").unwrap().is_none());
    }

    #[test]
    fn a_shows_poster_comes_from_its_stored_metadata() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','shows','/x','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at,metadata) VALUES ('s1','lib','Show','t',?1)",
                params![
                    r#"{"tmdbId":1,"tmdbUrl":"x","genres":[],"posterUrl":"/art/poster.jpg"}"#
                ],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at,metadata) VALUES ('s2','lib','Bare','t',?1)",
                params![r#"{"tmdbId":2,"tmdbUrl":"x","genres":[]}"#],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at) VALUES ('s3','lib','Raw','t')",
                [],
            )
            .unwrap();
        }
        assert_eq!(show_poster_art(&p, "s1").unwrap().as_deref(), Some("/art/poster.jpg"));
        assert!(show_poster_art(&p, "s2").unwrap().is_none());
        assert!(show_poster_art(&p, "s3").unwrap().is_none());
        assert!(show_poster_art(&p, "missing").unwrap().is_none());
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

    fn seed_backdrop(conn: &Connection, kind: &str, id: &str, backdrop: &str) {
        conn.execute(
            "INSERT INTO metadata_core (subject_kind,subject_id,backdrop_url,rating,updated_at) \
             VALUES (?1,?2,?3,7.5,0)",
            params![kind, id, backdrop],
        )
        .unwrap();
    }

    #[test]
    fn splash_captions_a_title_in_the_asked_for_locale() {
        // The one catalogue read served without a session, so the caption has
        // to be localised from the stored translation rather than from whatever
        // the scan happened to name the file.
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            seed_movie(&conn, "m1", "Dune", "lib");
            seed_backdrop(&conn, metadata_core::ITEM, "m1", "/b/m1.jpg");
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Severance','t')",
                [],
            )
            .unwrap();
            seed_backdrop(&conn, metadata_core::SHOW, "s1", "/b/s1.jpg");
        }
        crate::translations::put(
            &p,
            metadata_core::ITEM,
            "m1",
            "fr",
            "tmdb",
            &crate::translations::TransData {
                title: Some("Dune, première partie".into()),
                ..Default::default()
            },
        )
        .unwrap();
        crate::translations::put(
            &p,
            metadata_core::SHOW,
            "s1",
            "fr",
            "tmdb",
            &crate::translations::TransData {
                title: Some("Séparation".into()),
                ..Default::default()
            },
        )
        .unwrap();

        let mut titles: Vec<String> =
            splash_entries(&p, 10, "fr").unwrap().into_iter().map(|e| e.title).collect();
        titles.sort();
        assert_eq!(titles, ["Dune, première partie", "Séparation"]);
    }

    #[test]
    fn splash_keeps_the_stored_title_when_the_locale_has_no_translation() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            seed_movie(&conn, "m1", "Dune", "lib");
            seed_backdrop(&conn, metadata_core::ITEM, "m1", "/b/m1.jpg");
        }
        let entries = splash_entries(&p, 10, "de").unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].title, "Dune");
        assert_eq!(entries[0].backdrop_url, "/b/m1.jpg");
        assert_eq!(entries[0].kind, "movie");
    }

    #[test]
    fn splash_only_offers_titles_that_have_a_backdrop() {
        // The splash IS the backdrop; a title without one would be a blank slide.
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
            seed_backdrop(&conn, metadata_core::ITEM, "m1", "/b/m1.jpg");
        }
        let entries = splash_entries(&p, 10, "fr").unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].title, "Dune");
    }

    #[test]
    fn splash_never_hands_back_more_than_the_limit() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
                [],
            )
            .unwrap();
            for n in 0..5 {
                let id = format!("m{n}");
                seed_movie(&conn, &id, &format!("Film {n}"), "lib");
                seed_backdrop(&conn, metadata_core::ITEM, &id, "/b/x.jpg");
            }
        }
        assert_eq!(splash_entries(&p, 2, "fr").unwrap().len(), 2);
        assert!(splash_entries(&p, 0, "fr").unwrap().is_empty());
    }
}
