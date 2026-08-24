//! The show listing: counted rows, and the stream that heads each one.

use anyhow::Result;
use rusqlite::{params, Row};

use kroma_domain::{Show, VideoStream};

use crate::{parse_metadata, Pool, IN_CHUNK};

// Callers append their own `WHERE`/`ORDER BY` and map rows with `row_to_show_counted`.
pub(super) const SHOWS_COUNTED_SELECT: &str = "SELECT s.id,s.title,s.year,s.library,s.added_at,\
    (SELECT COUNT(DISTINCT i.season) FROM items i WHERE i.show_id=s.id),\
    (SELECT COUNT(*) FROM items i WHERE i.show_id=s.id),\
    s.metadata \
 FROM shows s";

pub(super) fn row_to_show_counted(r: &Row) -> rusqlite::Result<Show> {
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
pub(super) fn row_to_show_bare(r: &Row) -> rusqlite::Result<Show> {
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
        stmt.query_map([], row_to_show_counted)?
            .collect::<rusqlite::Result<Vec<_>>>()?
    };

    apply_representative_videos(&conn, &mut shows)?;
    Ok(shows)
}

/// Order is unspecified the caller re-orders by relevance.
pub fn get_shows_by_ids(pool: &Pool, ids: &[String]) -> Result<Vec<Show>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let conn = pool.get()?;
    let mut shows: Vec<Show> = Vec::with_capacity(ids.len());
    for chunk in ids.chunks(IN_CHUNK) {
        let placeholders = vec!["?"; chunk.len()].join(",");
        let sql = format!("{SHOWS_COUNTED_SELECT} WHERE s.id IN ({placeholders})");
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(
            rusqlite::params_from_iter(chunk.iter()),
            row_to_show_counted,
        )?;
        for show in rows {
            shows.push(show?);
        }
    }
    apply_representative_videos(&conn, &mut shows)?;
    Ok(shows)
}

// Rows arrive widest-first, so the first row seen per show wins exactly the
// per-show `ORDER BY v_width DESC LIMIT 1` the single-show query does.
pub(super) fn apply_representative_videos(
    conn: &rusqlite::Connection,
    shows: &mut [Show],
) -> Result<()> {
    if shows.is_empty() {
        return Ok(());
    }
    use std::collections::HashMap;
    let ids: Vec<&str> = shows.iter().map(|s| s.id.as_str()).collect();
    let mut best: HashMap<String, VideoStream> = HashMap::new();
    for chunk in ids.chunks(IN_CHUNK) {
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

pub(super) fn representative_video(
    conn: &rusqlite::Connection,
    show_id: &str,
) -> Result<Option<VideoStream>> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media::test_support::*;

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
    fn a_shows_headline_stream_errors_when_the_file_table_is_gone() {
        let p = pool();
        let conn = p.get().unwrap();
        conn.execute_batch("DROP TABLE files").unwrap();

        assert!(representative_video(&conn, "s1").is_err());
    }
}
