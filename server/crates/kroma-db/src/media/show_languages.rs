//! The languages each show's episodes are heard and read in.

use std::collections::HashMap;

use anyhow::Result;
use rusqlite::Row;

use kroma_domain::TrackLanguages;

use crate::Pool;

const LANGUAGES: &str = "\
SELECT i.show_id, 'audio', json_extract(t.value, '$.language') \
  FROM items i JOIN files f ON f.item_id = i.id, json_each(f.audio_tracks) t \
 WHERE i.show_id IS NOT NULL AND i.absent_since IS NULL \
UNION SELECT i.show_id, 'audio', f.a_language \
  FROM items i JOIN files f ON f.item_id = i.id \
 WHERE i.show_id IS NOT NULL AND i.absent_since IS NULL \
UNION SELECT i.show_id, 'subtitles', json_extract(t.value, '$.language') \
  FROM items i JOIN files f ON f.item_id = i.id, json_each(f.subtitles) t \
 WHERE i.show_id IS NOT NULL AND i.absent_since IS NULL";

/// Each show's [`TrackLanguages`], over the files of the episodes it still
/// has. A show with no file is absent.
pub fn show_languages(pool: &Pool) -> Result<HashMap<String, TrackLanguages>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(LANGUAGES)?;
    let mut out: HashMap<String, TrackLanguages> = HashMap::new();
    for row in stmt.query_map([], language_row)? {
        let (show, stream, language) = row?;
        add(out.entry(show).or_default(), &stream, language.as_deref());
    }
    Ok(out)
}

fn language_row(r: &Row<'_>) -> rusqlite::Result<(String, String, Option<String>)> {
    Ok((r.get(0)?, r.get(1)?, r.get(2)?))
}

fn add(languages: &mut TrackLanguages, stream: &str, language: Option<&str>) {
    match stream {
        "audio" => languages.hear(language),
        _ => languages.read(language),
    }
}

#[cfg(test)]
mod tests {
    use rusqlite::{Connection, params};

    use super::*;
    use crate::media::test_support::*;

    fn seed_episode(conn: &Connection, id: &str, audio: &str, subtitles: &str) {
        conn.execute(
            "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
             VALUES (?1,'episode','Ep','mkv','lib','s1',1,1,'t')",
            params![id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO files (id,item_id,abs_path,container,probed,a_language,audio_tracks,subtitles) \
             VALUES (?1,?1,?2,'mkv',1,NULL,?3,?4)",
            params![id, format!("/media/{id}.mkv"), audio, subtitles],
        )
        .unwrap();
    }

    #[test]
    fn a_show_is_heard_and_read_in_every_language_any_of_its_episodes_has() {
        let p = pool();
        let conn = p.get().unwrap();
        conn.execute_batch(
            "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','shows','/x','t'); \
             INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Show','t');",
        )
        .unwrap();
        seed_episode(
            &conn,
            "e1",
            r#"[{"codec":"aac","channels":2,"language":"jpn"}]"#,
            r#"[{"codec":"subrip","language":"fre"}]"#,
        );
        seed_episode(
            &conn,
            "e2",
            r#"[{"codec":"aac","channels":2,"language":"eng"},{"codec":"aac","channels":2}]"#,
            r#"[{"codec":"subrip","language":"fre"},{"codec":"ass","language":"eng"}]"#,
        );
        seed_episode(
            &conn,
            "e3",
            r#"[{"codec":"aac","channels":2,"language":"ger"}]"#,
            "[]",
        );
        conn.execute("UPDATE items SET absent_since = 1 WHERE id = 'e3'", [])
            .unwrap();
        seed_movie(&conn, "m1", "Film", "lib");
        drop(conn);

        let languages = show_languages(&p).unwrap();

        assert_eq!(languages.len(), 1);
        assert_eq!(languages["s1"].audio, ["eng", "jpn"]);
        assert_eq!(languages["s1"].subtitles, ["eng", "fre"]);
    }

    #[test]
    fn the_languages_error_when_the_file_table_is_gone() {
        let p = pool();
        p.get().unwrap().execute_batch("DROP TABLE files").unwrap();

        assert!(show_languages(&p).is_err());
    }
}
