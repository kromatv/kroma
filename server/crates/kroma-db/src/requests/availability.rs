//! What the library already holds for a requested title.

use rusqlite::{params, Connection, OptionalExtension};

/// `video` items count: enrichment resolves both against TMDB's movie namespace.
/// Joined back to `items` so a stale core row for a deleted item never matches.
pub fn movie_item_by_tmdb(conn: &Connection, tmdb_id: u64) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT c.subject_id FROM metadata_core c JOIN items i ON i.id = c.subject_id \
         WHERE c.subject_kind = 'item' AND c.tmdb_id = ?1 AND i.kind IN ('movie', 'video') LIMIT 1",
        params![tmdb_id as i64],
        |r| r.get(0),
    )
    .optional()
}

pub fn show_by_tmdb(conn: &Connection, tmdb_id: u64) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT c.subject_id FROM metadata_core c JOIN shows s ON s.id = c.subject_id \
         WHERE c.subject_kind = 'show' AND c.tmdb_id = ?1 LIMIT 1",
        params![tmdb_id as i64],
        |r| r.get(0),
    )
    .optional()
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
         WHERE i.show_id = ?1 AND i.season = ?2 AND i.episode = ?3 \
           AND (?4 IS NULL OR i.library = ?4)"
    ))?;
    let rows = stmt.query_map(params![show_id, season, episode, library], library_file)?;
    rows.collect()
}

pub fn episodes_present(conn: &Connection, show_id: &str) -> rusqlite::Result<Vec<(u32, u32)>> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT season, episode FROM items \
         WHERE show_id = ?1 AND season IS NOT NULL AND episode IS NOT NULL",
    )?;
    let rows = stmt.query_map(params![show_id], |r| Ok((r.get(0)?, r.get(1)?)))?;
    rows.collect()
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

/// Every episode of `show_id` on disk. One row per season/episode: a duplicate
/// keeps the widest copy, since that is the one a viewer gets.
pub fn episodes_on_disk(conn: &Connection, show_id: &str) -> rusqlite::Result<Vec<EpisodeOnDisk>> {
    let mut stmt = conn.prepare(
        "SELECT season, episode, id, v_codec, v_width, v_height, v_hdr, v_bit_depth, duration_ms \
         FROM items \
         WHERE show_id = ?1 AND season IS NOT NULL AND episode IS NOT NULL \
         ORDER BY season, episode, v_width DESC",
    )?;
    let rows = stmt.query_map(params![show_id], |r| {
        Ok(EpisodeOnDisk {
            season: r.get(0)?,
            episode: r.get(1)?,
            item_id: r.get(2)?,
            codec: r.get(3)?,
            width: r.get(4)?,
            height: r.get(5)?,
            hdr: r.get::<_, Option<i64>>(6)?.unwrap_or(0) != 0,
            bit_depth: r.get(7)?,
            duration_ms: r.get(8)?,
        })
    })?;
    let mut out: Vec<EpisodeOnDisk> = Vec::new();
    for row in rows {
        let row = row?;
        if out
            .last()
            .is_some_and(|p| p.season == row.season && p.episode == row.episode)
        {
            continue;
        }
        out.push(row);
    }
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

    #[test]
    fn episodes_on_disk_reports_one_row_per_episode_with_its_media() {
        let p = pool();
        let conn = p.get().unwrap();
        seed_library(&conn);
        conn.execute(
            "INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib1','Show','now')",
            [],
        )
        .unwrap();
        // Two files for S01E01: the widest wins, since that is what a viewer gets.
        for (id, season, episode, width) in
            [("i1", 1, 1, 1920), ("i2", 1, 1, 3840), ("i3", 1, 2, 1280)]
        {
            conn.execute(
                &format!(
                    "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,v_codec,v_width,v_height,v_hdr,duration_ms,added_at) \
                     VALUES ('{id}','episode','E','mkv','lib1','s1',{season},{episode},'hevc',{width},1080,1,600000,'now')"
                ),
                [],
            )
            .unwrap();
        }

        let rows = episodes_on_disk(&conn, "s1").unwrap();
        assert_eq!(rows.len(), 2, "one row per episode, not per file");
        let e1 = rows.iter().find(|r| r.episode == 1).unwrap();
        assert_eq!(e1.width, Some(3840), "the widest copy of the two");
        assert_eq!(e1.codec.as_deref(), Some("hevc"));
        assert!(e1.hdr);
        assert_eq!(e1.duration_ms, Some(600_000));
        assert_eq!(
            rows.iter().find(|r| r.episode == 2).unwrap().width,
            Some(1280)
        );
    }
}
