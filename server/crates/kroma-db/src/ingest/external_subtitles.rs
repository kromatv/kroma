use std::collections::HashMap;

use rusqlite::params;

use crate::{Pool, Result};

const SET: &str = "UPDATE files SET external_subtitle_languages = ?2 \
                   WHERE id = ?1 AND external_subtitle_languages IS NOT ?2";

/// Record, for each file id of `languages`, the languages of the text subtitle
/// files a scan found beside it, replacing what an earlier scan found. A file
/// the database does not hold is passed over. Returns how many files changed.
pub fn set_external_subtitle_languages(
    pool: &Pool,
    languages: &HashMap<String, Vec<String>>,
) -> Result<usize> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    let mut changed = 0;
    {
        let mut set = tx.prepare(SET)?;
        for (file, codes) in languages {
            changed += set.execute(params![file, serde_json::to_string(codes)?])?;
        }
    }
    tx.commit()?;
    Ok(changed)
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::super::sync_all;
    use super::super::test_support::*;
    use super::*;

    fn stored(conn: &Connection, file: &str) -> String {
        conn.query_row(
            "SELECT external_subtitle_languages FROM files WHERE id = ?1",
            [file],
            |r| r.get(0),
        )
        .unwrap()
    }

    fn languages(of: &[(&str, &[&str])]) -> HashMap<String, Vec<String>> {
        of.iter()
            .map(|(file, codes)| {
                let codes = codes.iter().map(ToString::to_string).collect();
                (file.to_string(), codes)
            })
            .collect()
    }

    #[test]
    fn a_scan_replaces_the_languages_found_beside_a_file_and_counts_what_changed() {
        let p = pool();
        let items = vec![movie(
            "m1",
            "Film",
            "lib",
            vec![file("f1", "/m/f1.mkv", false)],
        )];
        sync_all(&p, &[lib("lib")], &[], &items, &mtimes_of(&items, 1)).unwrap();

        let first = set_external_subtitle_languages(&p, &languages(&[("f1", &["en", "fr"])]));
        let again = set_external_subtitle_languages(&p, &languages(&[("f1", &["en", "fr"])]));
        let gone =
            set_external_subtitle_languages(&p, &languages(&[("f1", &[]), ("nope", &["de"])]));

        assert_eq!(first.unwrap(), 1);
        assert_eq!(again.unwrap(), 0);
        assert_eq!(gone.unwrap(), 1);
        assert_eq!(stored(&p.get().unwrap(), "f1"), "[]");
    }
}
