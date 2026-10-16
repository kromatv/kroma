//! A title's files, as the quality rules judge them.

use kroma_domain::{MediaFile, RequestKind};
use rusqlite::{params, Connection};

use crate::{row_to_file, FILE_COLS};

/// One file of a title, with the episodes it holds (none for a film).
#[derive(Debug, Clone)]
pub struct TitleFile {
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub episode_end: Option<u32>,
    pub file: MediaFile,
}

/// Every file of a title by its TMDB id, probe facts included. A film just
/// imported counts before enrichment matches it, through its import pin.
pub fn title_files(
    conn: &Connection,
    kind: RequestKind,
    tmdb_id: u64,
) -> rusqlite::Result<Vec<TitleFile>> {
    let cols = FILE_COLS
        .split(',')
        .map(|c| format!("f.{c}"))
        .collect::<Vec<_>>()
        .join(",");
    let sql = match kind {
        RequestKind::Movie => format!(
            "SELECT {cols}, NULL, NULL, NULL FROM files f \
             WHERE f.item_id IN ( \
                 SELECT i.id FROM items i \
                 JOIN metadata_core c ON c.subject_id = i.id AND c.subject_kind = 'item' \
                 WHERE c.tmdb_id = ?1 AND i.kind IN ('movie', 'video')) \
             OR f.abs_path IN (SELECT abs_path FROM acq_file_tmdb WHERE tmdb_id = ?1) \
             ORDER BY f.id"
        ),
        RequestKind::Show => format!(
            "SELECT {cols}, i.season, i.episode, i.episode_end FROM files f \
             JOIN items i ON i.id = f.item_id \
             JOIN metadata_core c ON c.subject_id = i.show_id AND c.subject_kind = 'show' \
             WHERE c.tmdb_id = ?1 AND i.season IS NOT NULL \
             ORDER BY i.season, i.episode, f.id"
        ),
    };
    let tail = FILE_COLS.split(',').count();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![tmdb_id as i64], |r| {
        Ok(TitleFile {
            season: r.get(tail)?,
            episode: r.get(tail + 1)?,
            episode_end: r.get(tail + 2)?,
            file: row_to_file(r)?,
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::requests::tests::*;

    fn seed(conn: &Connection) {
        seed_library(conn);
        conn.execute_batch(
            "INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib1','Show','now');
             INSERT INTO metadata_core (subject_kind,subject_id,tmdb_id,updated_at) VALUES ('show','s1',77,0);
             INSERT INTO items (id,kind,title,container,library,show_id,season,episode,episode_end,added_at)
                 VALUES ('e1','episode','E','mkv','lib1','s1',1,1,2,'now');
             INSERT INTO files (id,item_id,abs_path,rel_path,container,probed,v_codec,v_width,v_height,audio_tracks)
                 VALUES ('f1','e1','/x/e1.mkv','e1.mkv','mkv',1,'hevc',1920,1080,
                         '[{\"codec\":\"eac3\",\"language\":\"fre\",\"title\":\"VFQ\"}]');
             INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m1','movie','M','mkv','lib1','now');
             INSERT INTO files (id,item_id,abs_path,rel_path,container) VALUES ('f2','m1','/x/m.mkv','m.mkv','mkv');
             INSERT INTO acq_file_tmdb (abs_path,tmdb_id) VALUES ('/x/m.mkv',603);",
        )
        .unwrap();
    }

    #[test]
    fn an_episode_file_carries_its_run_and_its_probe() {
        let p = pool();
        let conn = p.get().unwrap();
        seed(&conn);

        let files = title_files(&conn, RequestKind::Show, 77).unwrap();

        assert_eq!(files.len(), 1);
        assert_eq!((files[0].season, files[0].episode, files[0].episode_end), (Some(1), Some(1), Some(2)));
        assert_eq!(files[0].file.video.as_ref().unwrap().width, Some(1920));
        assert_eq!(files[0].file.audio_tracks[0].region.as_deref(), Some("CA"));
    }

    #[test]
    fn a_film_pinned_by_its_import_counts_before_it_is_matched() {
        let p = pool();
        let conn = p.get().unwrap();
        seed(&conn);

        let files = title_files(&conn, RequestKind::Movie, 603).unwrap();

        assert_eq!(files.len(), 1);
        assert_eq!(files[0].file.id, "f2");
        assert_eq!(files[0].season, None);
    }
}
