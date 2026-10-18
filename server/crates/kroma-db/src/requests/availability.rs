//! What the library already holds for a requested title.

use kroma_domain::RequestKind;
use rusqlite::{params, Connection};

pub fn movie_item_by_tmdb(conn: &Connection, tmdb_id: u64) -> rusqlite::Result<Option<String>> {
    crate::visibility::title_by_tmdb(conn, RequestKind::Movie, tmdb_id)
}

pub fn show_by_tmdb(conn: &Connection, tmdb_id: u64) -> rusqlite::Result<Option<String>> {
    crate::visibility::title_by_tmdb(conn, RequestKind::Show, tmdb_id)
}

/// One physical file backing a catalog item, with what an upgrade needs to
/// decide whether a new release actually supersedes it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LibraryFile {
    pub path: String,
    pub item_id: String,
    pub edition: Option<String>,
    pub spans_episodes: bool,
}

const SPANS_EPISODES: &str = "i.episode_end IS NOT NULL AND i.episode_end > i.episode";

fn library_file(row: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryFile> {
    Ok(LibraryFile {
        path: row.get(0)?,
        item_id: row.get(1)?,
        edition: row.get(2)?,
        spans_episodes: row.get(3)?,
    })
}

/// The files backing a movie, by TMDB id, restricted to one library when
/// `library` is set. Candidates for what an upgrade replaces: the caller still
/// has to match the edition, since one item holds every cut of a title.
pub fn movie_files_by_tmdb(
    conn: &Connection,
    tmdb_id: u64,
    library: Option<&str>,
) -> rusqlite::Result<Vec<LibraryFile>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT f.abs_path, f.item_id, f.edition, {SPANS_EPISODES} FROM files f \
         JOIN items i ON i.id = f.item_id \
         JOIN metadata_core c ON c.subject_id = i.id AND c.subject_kind = 'item' \
         WHERE c.tmdb_id = ?1 AND i.kind IN ('movie', 'video') \
           AND (?2 IS NULL OR i.library = ?2)"
    ))?;
    let rows = stmt.query_map(params![tmdb_id as i64, library], library_file)?;
    rows.collect()
}

/// The files backing one episode of a show, restricted to one library when
/// `library` is set. A file that holds a run of episodes is reported with
/// `spans_episodes`, since it answers for every episode in the run and not just
/// the one asked for.
pub fn episode_files(
    conn: &Connection,
    show_id: &str,
    season: u32,
    episode: u32,
    library: Option<&str>,
) -> rusqlite::Result<Vec<LibraryFile>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT f.abs_path, f.item_id, f.edition, {SPANS_EPISODES} FROM files f \
         JOIN items i ON i.id = f.item_id \
         WHERE i.show_id = ?1 AND i.season = ?2 \
           AND ?3 BETWEEN i.episode AND COALESCE(i.episode_end, i.episode) \
           AND (?4 IS NULL OR i.library = ?4)"
    ))?;
    let rows = stmt.query_map(params![show_id, season, episode, library], library_file)?;
    rows.collect()
}

/// Every `(season, episode)` of `show_id` the library holds, a file that holds a
/// run of episodes answering for each one in the run.
pub fn episodes_present(conn: &Connection, show_id: &str) -> rusqlite::Result<Vec<(u32, u32)>> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT season, episode, episode_end FROM items \
         WHERE show_id = ?1 AND season IS NOT NULL AND episode IS NOT NULL",
    )?;
    let rows = stmt.query_map(params![show_id], |r| {
        Ok((
            r.get::<_, u32>(0)?,
            r.get::<_, u32>(1)?,
            r.get::<_, Option<u32>>(2)?,
        ))
    })?;
    let mut present = Vec::new();
    for row in rows {
        let (season, first, last) = row?;
        present.extend(episode_run(first, last).map(|episode| (season, episode)));
    }
    present.sort_unstable();
    present.dedup();
    Ok(present)
}

fn episode_run(first: u32, last: Option<u32>) -> std::ops::RangeInclusive<u32> {
    first..=last.unwrap_or(first).max(first)
}

/// One episode of a show the library actually holds: which item it is, and how
/// good the copy is. What the request page needs to link to a file and say what
/// a re-grab would be replacing.
#[derive(Debug, Clone)]
pub struct EpisodeOnDisk {
    pub season: u32,
    pub episode: u32,
    pub item_id: String,
    pub codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub hdr: bool,
    pub bit_depth: Option<u32>,
    pub duration_ms: Option<i64>,
}

/// Every episode of `show_id` on disk, described by its best readable file. One
/// row per season/episode: the widest copy wins, since that is the one a viewer
/// gets, and a file holding a run of episodes answers for each of them.
pub fn episodes_on_disk(conn: &Connection, show_id: &str) -> rusqlite::Result<Vec<EpisodeOnDisk>> {
    let mut stmt = conn.prepare(
        "SELECT i.season, i.episode, i.episode_end, i.id, \
                f.v_codec, f.v_width, f.v_height, f.v_hdr, f.v_bit_depth, \
                COALESCE(f.duration_ms, i.duration_ms) \
         FROM items i \
         LEFT JOIN files f ON f.item_id = i.id AND f.probed = 1 AND f.unreadable IS NULL \
         WHERE i.show_id = ?1 AND i.season IS NOT NULL AND i.episode IS NOT NULL \
         ORDER BY i.season, i.episode, f.v_width DESC NULLS LAST",
    )?;
    let rows = stmt.query_map(params![show_id], |r| {
        Ok((
            r.get::<_, Option<u32>>(2)?,
            EpisodeOnDisk {
                season: r.get(0)?,
                episode: r.get(1)?,
                item_id: r.get(3)?,
                codec: r.get(4)?,
                width: r.get(5)?,
                height: r.get(6)?,
                hdr: r.get::<_, Option<i64>>(7)?.unwrap_or(0) != 0,
                bit_depth: r.get(8)?,
                duration_ms: r.get(9)?,
            },
        ))
    })?;
    let mut seen = std::collections::HashSet::new();
    let mut out: Vec<EpisodeOnDisk> = Vec::new();
    for row in rows {
        let (last, best) = row?;
        for episode in episode_run(best.episode, last) {
            if seen.insert((best.season, episode)) {
                out.push(EpisodeOnDisk {
                    episode,
                    ..best.clone()
                });
            }
        }
    }
    out.sort_by_key(|row| (row.season, row.episode));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::requests::tests::*;

    #[test]
    fn availability_lookup_matches_metadata_tmdb_id() {
        let p = pool();
        let conn = p.get().unwrap();
        seed_library(&conn);
        insert_movie_item(&conn, "m1", 603);
        assert_eq!(
            movie_item_by_tmdb(&conn, 603).unwrap().as_deref(),
            Some("m1")
        );
        assert_eq!(movie_item_by_tmdb(&conn, 604).unwrap(), None);
        // An item with no metadata_core row has no tmdb_id to seek.
        conn.execute(
            "INSERT INTO items (id, kind, title, container, library, added_at) \
             VALUES ('m2','movie','U','mkv','lib1','now')",
            [],
        )
        .unwrap();
        assert_eq!(movie_item_by_tmdb(&conn, 0).unwrap(), None);
    }

    fn seed_episode(conn: &Connection, id: &str, episode: u32, episode_end: Option<u32>) {
        conn.execute(
            "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,episode_end,duration_ms,added_at) \
             VALUES (?1,'episode','E','mkv','lib1','s1',1,?2,?3,600000,'now')",
            params![id, episode, episode_end],
        )
        .unwrap();
    }

    fn seed_episode_file(conn: &Connection, id: &str, item_id: &str, width: u32) {
        conn.execute(
            "INSERT INTO files (id,item_id,abs_path,rel_path,container,probed,duration_ms,v_codec,v_width,v_height,v_hdr) \
             VALUES (?1,?2,?3,?1,'mkv',1,600000,'hevc',?4,1080,1)",
            params![id, item_id, format!("/x/{id}.mkv"), width],
        )
        .unwrap();
    }

    fn seed_show_with_episodes(conn: &Connection) {
        seed_library(conn);
        conn.execute(
            "INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib1','Show','now')",
            [],
        )
        .unwrap();
        seed_episode(conn, "e1", 1, None);
        seed_episode_file(conn, "f1", "e1", 1920);
        seed_episode_file(conn, "f2", "e1", 3840);
        seed_episode(conn, "e2", 2, None);
        seed_episode(conn, "e3", 3, Some(4));
        seed_episode_file(conn, "f3", "e3", 1280);
    }

    #[test]
    fn episodes_on_disk_describe_an_episode_by_its_widest_file() {
        let p = pool();
        let conn = p.get().unwrap();
        seed_show_with_episodes(&conn);

        let rows = episodes_on_disk(&conn, "s1").unwrap();

        let e1 = rows.iter().find(|r| r.episode == 1).unwrap();
        assert_eq!(e1.width, Some(3840));
        assert_eq!(e1.codec.as_deref(), Some("hevc"));
        assert!(e1.hdr);
        assert_eq!(e1.duration_ms, Some(600_000));
    }

    #[test]
    fn episodes_on_disk_keep_an_unprobed_episode_with_no_video() {
        let p = pool();
        let conn = p.get().unwrap();
        seed_show_with_episodes(&conn);

        let rows = episodes_on_disk(&conn, "s1").unwrap();

        let e2 = rows.iter().find(|r| r.episode == 2).unwrap();
        assert_eq!(e2.item_id, "e2");
        assert_eq!(e2.width, None);
    }

    #[test]
    fn episodes_on_disk_answer_for_every_episode_of_a_run() {
        let p = pool();
        let conn = p.get().unwrap();
        seed_show_with_episodes(&conn);

        let rows = episodes_on_disk(&conn, "s1").unwrap();

        let episodes: Vec<(u32, &str)> = rows
            .iter()
            .map(|r| (r.episode, r.item_id.as_str()))
            .collect();
        assert_eq!(episodes, [(1, "e1"), (2, "e2"), (3, "e3"), (4, "e3")]);
    }

    #[test]
    fn episodes_present_count_the_second_episode_of_a_run() {
        let p = pool();
        let conn = p.get().unwrap();
        seed_show_with_episodes(&conn);

        let present = episodes_present(&conn, "s1").unwrap();

        assert_eq!(present, [(1, 1), (1, 2), (1, 3), (1, 4)]);
    }

    #[test]
    fn episode_files_find_the_run_that_holds_an_episode() {
        let p = pool();
        let conn = p.get().unwrap();
        seed_show_with_episodes(&conn);

        let files = episode_files(&conn, "s1", 1, 4, None).unwrap();

        assert_eq!(files.len(), 1);
        assert_eq!(files[0].item_id, "e3");
        assert!(files[0].spans_episodes);
    }
}
