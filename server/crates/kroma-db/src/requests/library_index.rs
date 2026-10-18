use std::collections::HashMap;

use kroma_domain::{LibraryTitle, RequestKind};
use rusqlite::{Connection, params};

use super::monitored_summaries;

const MOVIES: &str = "SELECT i.id, i.title, i.year, \
        COALESCE(c.tmdb_id, json_extract(i.metadata, '$.tmdbId')), \
        COALESCE(c.poster_url, json_extract(i.metadata, '$.posterUrl')), i.added_at, \
        (SELECT COALESCE(SUM(f.size), 0) FROM files f WHERE f.item_id = i.id) \
     FROM items i \
     LEFT JOIN metadata_core c ON c.subject_kind = 'item' AND c.subject_id = i.id \
     WHERE i.kind IN ('movie', 'video')";

const SHOWS: &str = "SELECT s.id, s.title, s.year, \
        COALESCE(c.tmdb_id, json_extract(s.metadata, '$.tmdbId')), \
        COALESCE(c.poster_url, json_extract(s.metadata, '$.posterUrl')), s.added_at, \
        (SELECT COALESCE(SUM(f.size), 0) FROM files f \
             JOIN items e ON e.id = f.item_id WHERE e.show_id = s.id), \
        (SELECT COALESCE(SUM(MAX(COALESCE(e.episode_end, e.episode), e.episode) - e.episode + 1), 0) \
             FROM items e \
             WHERE e.show_id = s.id AND e.season IS NOT NULL AND e.episode IS NOT NULL), \
        (SELECT COUNT(DISTINCT e.season) FROM items e \
             WHERE e.show_id = s.id AND e.season IS NOT NULL) \
     FROM shows s \
     LEFT JOIN metadata_core c ON c.subject_kind = 'show' AND c.subject_id = s.id";

const NEXT_AIRING: &str = "SELECT tmdb_id, MIN(air_date) FROM wanted \
     WHERE kind = 'episode' AND air_date IS NOT NULL AND air_date > ?1 \
     GROUP BY tmdb_id";

fn blank(kind: RequestKind, title: String) -> LibraryTitle {
    LibraryTitle {
        kind,
        tmdb_id: None,
        local_id: None,
        title,
        year: None,
        poster_url: None,
        added_at: None,
        on_disk: 0,
        season_count: 0,
        size_bytes: 0,
        monitored: false,
        monitored_units: 0,
        available: 0,
        missing: 0,
        grabbed: 0,
        air_status: None,
        next_air_date: None,
    }
}

fn library_rows(conn: &Connection) -> rusqlite::Result<Vec<LibraryTitle>> {
    let mut out = Vec::new();
    let mut movies = conn.prepare(MOVIES)?;
    let rows = movies.query_map([], |r| {
        Ok(LibraryTitle {
            local_id: r.get(0)?,
            year: r.get(2)?,
            tmdb_id: r.get::<_, Option<i64>>(3)?.map(|id| id as u64),
            poster_url: r.get(4)?,
            added_at: r.get(5)?,
            size_bytes: r.get(6)?,
            on_disk: 1,
            ..blank(RequestKind::Movie, r.get(1)?)
        })
    })?;
    for row in rows {
        out.push(row?);
    }
    let mut shows = conn.prepare(SHOWS)?;
    let rows = shows.query_map([], |r| {
        Ok(LibraryTitle {
            local_id: r.get(0)?,
            year: r.get(2)?,
            tmdb_id: r.get::<_, Option<i64>>(3)?.map(|id| id as u64),
            poster_url: r.get(4)?,
            added_at: r.get(5)?,
            size_bytes: r.get(6)?,
            on_disk: r.get(7)?,
            season_count: r.get(8)?,
            ..blank(RequestKind::Show, r.get(1)?)
        })
    })?;
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

fn next_airings(conn: &Connection, today: &str) -> rusqlite::Result<HashMap<u64, String>> {
    let mut stmt = conn.prepare(NEXT_AIRING)?;
    let rows = stmt.query_map(params![today], |r| {
        Ok((r.get::<_, i64>(0)? as u64, r.get::<_, String>(1)?))
    })?;
    rows.collect()
}

/// Every title the library holds and every title monitoring wants, as one list.
/// `today` dates "missing" and the next airing against the server's own clock,
/// so the index agrees with the search gate.
pub fn library_index(conn: &Connection, today: &str) -> rusqlite::Result<Vec<LibraryTitle>> {
    let mut rows = library_rows(conn)?;
    let airings = next_airings(conn, today)?;
    let mut held: HashMap<(RequestKind, u64), usize> = HashMap::new();
    for (at, row) in rows.iter().enumerate() {
        if let Some(tmdb_id) = row.tmdb_id {
            held.entry((row.kind, tmdb_id)).or_insert(at);
        }
    }
    for summary in monitored_summaries(conn, today)? {
        let key = (summary.title.kind, summary.title.tmdb_id);
        let at = match held.get(&key) {
            Some(at) => *at,
            None => {
                rows.push(LibraryTitle {
                    tmdb_id: Some(summary.title.tmdb_id),
                    year: summary.title.year,
                    poster_url: summary.title.poster_url.clone(),
                    ..blank(summary.title.kind, summary.title.title.clone())
                });
                rows.len() - 1
            }
        };
        let Some(row) = rows.get_mut(at) else { continue };
        row.monitored = true;
        row.monitored_units = summary.monitored;
        row.available = summary.available;
        row.missing = summary.missing;
        row.grabbed = summary.grabbed;
        row.air_status = summary.title.air_status.clone();
        row.next_air_date = airings.get(&summary.title.tmdb_id).cloned();
    }
    rows.sort_by_key(|row| row.title.to_lowercase());
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::requests::tests::*;
    use crate::requests::{WantedRow, insert_wanted, upsert_monitored};
    use kroma_domain::{MinAvailability, MonitoredTitle};

    const SEVERANCE: u64 = 95396;

    fn wanted(id: &str, episode: u32, air: Option<&str>) -> WantedRow {
        WantedRow {
            id: id.into(),
            request_id: None,
            kind: "episode".into(),
            tmdb_id: SEVERANCE,
            imdb_id: None,
            title: "Severance".into(),
            year: Some(2022),
            season: Some(1),
            episode: Some(episode),
            air_date: air.map(str::to_string),
            status: "wanted".into(),
            last_search_at: None,
        }
    }

    fn seed(conn: &Connection) {
        seed_library(conn);
        conn.execute_batch(
            "INSERT INTO items (id,kind,title,year,container,library,added_at)
                 VALUES ('m1','movie','Dune',2021,'mkv','lib1','2026-01-01');
             INSERT INTO metadata_core (subject_kind,subject_id,tmdb_id,poster_url,updated_at)
                 VALUES ('item','m1',438631,'/p/dune.webp',0);
             INSERT INTO files (id,item_id,abs_path,rel_path,container,size)
                 VALUES ('f1','m1','/x/dune.mkv','dune.mkv','mkv',4096);
             INSERT INTO shows (id,library,title,year,added_at)
                 VALUES ('s1','lib1','Severance',2022,'2026-01-02');
             INSERT INTO metadata_core (subject_kind,subject_id,tmdb_id,updated_at)
                 VALUES ('show','s1',95396,0);
             INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at)
                 VALUES ('e1','episode','E1','mkv','lib1','s1',1,1,'now');
             INSERT INTO items (id,kind,title,container,library,show_id,season,episode,episode_end,added_at)
                 VALUES ('e2','episode','E2','mkv','lib1','s1',1,2,3,'now');
             INSERT INTO files (id,item_id,abs_path,rel_path,container,size)
                 VALUES ('f2','e1','/x/e1.mkv','e1.mkv','mkv',1024);",
        )
        .unwrap();
    }

    fn monitored_show(tmdb_id: u64, title: &str) -> MonitoredTitle {
        MonitoredTitle {
            kind: RequestKind::Show,
            tmdb_id,
            title: title.into(),
            year: Some(2022),
            poster_url: None,
            seasons: vec![1],
            monitor_new_seasons: true,
            min_availability: MinAvailability::Released,
            last_season: None,
            added_by: None,
            added_at: 1,
            updated_at: 1,
            original_language: None,
            air_status: Some("Returning Series".into()),
            refreshed_at: None,
            known_episodes: Default::default(),
            aliases: Vec::new(),
        }
    }

    #[test]
    fn a_title_on_disk_is_listed_whether_or_not_anything_monitors_it() {
        let p = pool();
        let conn = p.get().unwrap();
        seed(&conn);

        let rows = library_index(&conn, "2026-01-10").unwrap();

        let dune = rows.iter().find(|r| r.title == "Dune").unwrap();
        assert!(!dune.monitored);
        assert_eq!((dune.on_disk, dune.size_bytes), (1, 4096));
        assert_eq!(dune.tmdb_id, Some(438631));
        let show = rows.iter().find(|r| r.title == "Severance").unwrap();
        assert_eq!(
            (show.on_disk, show.season_count),
            (3, 1),
            "a file spanning two episodes holds both"
        );
    }

    #[test]
    fn a_monitored_title_carries_its_counts_and_its_next_airing() {
        let p = pool();
        let conn = p.get().unwrap();
        seed(&conn);
        upsert_monitored(&p, &monitored_show(SEVERANCE, "Severance")).unwrap();
        insert_wanted(&p, &[wanted("w1", 3, None), wanted("w2", 4, Some("2026-02-01"))], 1)
            .unwrap();

        let rows = library_index(&conn, "2026-01-10").unwrap();

        let show = rows.iter().find(|r| r.title == "Severance").unwrap();
        assert!(show.monitored);
        assert_eq!(show.monitored_units, 2);
        assert_eq!(show.next_air_date.as_deref(), Some("2026-02-01"));
        assert_eq!(show.air_status.as_deref(), Some("Returning Series"));
    }

    #[test]
    fn a_monitored_title_the_library_has_nothing_of_still_gets_a_row() {
        let p = pool();
        let conn = p.get().unwrap();
        seed(&conn);
        upsert_monitored(&p, &monitored_show(1399, "Game of Thrones")).unwrap();

        let rows = library_index(&conn, "2026-01-10").unwrap();

        let added = rows.iter().find(|r| r.title == "Game of Thrones").unwrap();
        assert!(added.monitored);
        assert_eq!((added.on_disk, added.local_id.is_none()), (0, true));
    }
}
