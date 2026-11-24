use std::collections::HashMap;

use anyhow::Result;

use crate::Pool;

const LANGUAGES: &str = "\
SELECT item_id, language FROM downloaded_subtitles WHERE language IS NOT NULL \
UNION SELECT f.item_id, l.value FROM files f, json_each(f.external_subtitle_languages) l";

/// The languages of every subtitle file a title has outside its videos, by
/// item: the ones downloaded for it and the ones a scan found beside its files.
/// A subtitle that names no language is left out.
pub fn subtitle_file_languages(pool: &Pool) -> Result<HashMap<String, Vec<String>>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(LANGUAGES)?;
    let mut out: HashMap<String, Vec<String>> = HashMap::new();
    for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get(1)?)))? {
        let (item, language) = row?;
        out.entry(item).or_default().push(language);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::*;
    use crate::media::test_support::*;

    fn seed(conn: &Connection) {
        conn.execute(
            "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
            [],
        )
        .unwrap();
        seed_movie(conn, "m1", "Film", "lib");
        seed_movie(conn, "m2", "Other", "lib");
        seed_probed_file(conn, "f1", "m1", "/m/film.mkv", 3840);
        seed_probed_file(conn, "f2", "m2", "/m/other.mkv", 3840);
    }

    #[test]
    fn a_title_reads_in_what_was_downloaded_for_it_and_what_lies_beside_its_files() {
        let p = pool();
        let conn = p.get().unwrap();
        seed(&conn);
        conn.execute_batch(
            "UPDATE files SET external_subtitle_languages = '[\"en\",\"fr\"]' WHERE id = 'f1'; \
             INSERT INTO downloaded_subtitles (id,item_id,language,label,provider,path,created_at) \
             VALUES ('s1','m1','fr','French','whisper','/s1.vtt','t'), \
                    ('s2','m2',NULL,'Unknown','whisper','/s2.vtt','t');",
        )
        .unwrap();

        let mut languages = subtitle_file_languages(&p).unwrap();

        languages.values_mut().for_each(|codes| codes.sort());
        assert_eq!(languages.len(), 1);
        assert_eq!(languages["m1"], ["en", "fr"]);
    }
}
