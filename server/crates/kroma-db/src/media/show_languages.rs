//! The languages each show's episodes are heard and read in.

use std::collections::{BTreeMap, HashMap};

use anyhow::Result;
use rusqlite::Row;

use kroma_domain::{ShowLanguages, TrackLanguages};

use crate::Pool;

const LANGUAGES: &str = "\
SELECT i.show_id, i.id, 'audio', json_extract(t.value, '$.language') \
  FROM items i JOIN files f ON f.item_id = i.id, json_each(f.audio_tracks) t \
 WHERE i.show_id IS NOT NULL AND i.absent_since IS NULL \
UNION SELECT i.show_id, i.id, 'audio', f.a_language \
  FROM items i JOIN files f ON f.item_id = i.id \
 WHERE i.show_id IS NOT NULL AND i.absent_since IS NULL \
UNION SELECT i.show_id, i.id, 'subtitles', json_extract(t.value, '$.language') \
  FROM items i JOIN files f ON f.item_id = i.id, json_each(f.subtitles) t \
 WHERE i.show_id IS NOT NULL AND i.absent_since IS NULL \
UNION SELECT i.show_id, i.id, 'subtitles', d.language \
  FROM items i JOIN downloaded_subtitles d ON d.item_id = i.id \
 WHERE i.show_id IS NOT NULL AND i.absent_since IS NULL";

type Episodes = BTreeMap<String, TrackLanguages>;

struct LanguageRow {
    show: String,
    episode: String,
    stream: String,
    language: Option<String>,
}

/// Each show's [`ShowLanguages`], over the files of the episodes it still
/// has. A show with no file is absent.
pub fn show_languages(pool: &Pool) -> Result<HashMap<String, ShowLanguages>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(LANGUAGES)?;
    let mut shows: HashMap<String, Episodes> = HashMap::new();
    for row in stmt.query_map([], language_row)? {
        let row = row?;
        let episode = shows.entry(row.show).or_default().entry(row.episode);
        add(episode.or_default(), &row.stream, row.language.as_deref());
    }
    Ok(shows
        .into_iter()
        .map(|(show, episodes)| (show, ShowLanguages::of_episodes(episodes.into_values())))
        .collect())
}

fn language_row(r: &Row<'_>) -> rusqlite::Result<LanguageRow> {
    Ok(LanguageRow {
        show: r.get(0)?,
        episode: r.get(1)?,
        stream: r.get(2)?,
        language: r.get(3)?,
    })
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
        assert_eq!(languages["s1"].all.audio, ["eng", "jpn"]);
        assert_eq!(languages["s1"].all.subtitles, ["eng", "fre"]);
    }

    #[test]
    fn each_episode_keeps_its_own_languages_beside_the_show_s() {
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
            r#"[{"codec":"aac","channels":2,"language":"eng"}]"#,
            "[]",
        );
        seed_episode(
            &conn,
            "e2",
            r#"[{"codec":"aac","channels":2,"language":"jpn"}]"#,
            r#"[{"codec":"subrip","language":"fre"}]"#,
        );
        drop(conn);

        let languages = show_languages(&p).unwrap();

        let episodes: Vec<_> = languages["s1"]
            .episodes
            .iter()
            .map(|e| (e.audio.clone(), e.subtitles.clone()))
            .collect();
        assert_eq!(
            episodes,
            [
                (vec!["eng".to_string()], vec![]),
                (vec!["jpn".to_string()], vec!["fre".to_string()]),
            ]
        );
    }

    #[test]
    fn a_subtitle_downloaded_for_an_episode_counts_for_that_episode() {
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
            r#"[{"codec":"aac","channels":2,"language":"eng"}]"#,
            "[]",
        );
        conn.execute(
            "INSERT INTO downloaded_subtitles (id,item_id,language,label,provider,path,created_at) \
             VALUES ('d1','e1','spa','Spanish','opensubtitles','/data/d1.vtt','t')",
            [],
        )
        .unwrap();
        drop(conn);

        let languages = show_languages(&p).unwrap();

        assert_eq!(languages["s1"].all.subtitles, ["spa"]);
        assert_eq!(languages["s1"].episodes[0].subtitles, ["spa"]);
    }

    #[test]
    fn the_languages_error_when_the_file_table_is_gone() {
        let p = pool();
        p.get().unwrap().execute_batch("DROP TABLE files").unwrap();

        assert!(show_languages(&p).is_err());
    }
}
