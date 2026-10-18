//! The files a torrent itself holds, recorded when it finishes.

use anyhow::Result;
use rusqlite::{OptionalExtension, params};

use crate::db::Pool;

/// Records the paths a torrent holds, relative to its save path, replacing
/// whatever an earlier poll saw.
pub fn set_download_contents(pool: &Pool, id: &str, paths: &[String]) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO download_contents (download_id, paths) VALUES (?1, ?2) \
         ON CONFLICT(download_id) DO UPDATE SET paths = excluded.paths",
        params![id, serde_json::to_string(paths)?],
    )?;
    Ok(())
}

/// What the torrent holds. Empty when no poll has seen its file list.
pub fn download_contents(pool: &Pool, id: &str) -> Result<Vec<String>> {
    let conn = pool.get()?;
    let stored: Option<String> = conn
        .query_row(
            "SELECT paths FROM download_contents WHERE download_id = ?1",
            params![id],
            |r| r.get(0),
        )
        .optional()?;
    Ok(stored
        .and_then(|paths| serde_json::from_str(&paths).ok())
        .unwrap_or_default())
}

pub fn forget_download_contents(pool: &Pool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "DELETE FROM download_contents WHERE download_id = ?1",
        params![id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::test_db;

    #[test]
    fn the_files_a_torrent_holds_are_kept_beside_its_row_and_cleared_with_it() {
        let pool = test_db();

        set_download_contents(&pool, "d1", &["Pack/a.mkv".into(), "Pack/b.mkv".into()]).unwrap();

        assert_eq!(
            download_contents(&pool, "d1").unwrap(),
            ["Pack/a.mkv", "Pack/b.mkv"]
        );
        forget_download_contents(&pool, "d1").unwrap();
        assert!(download_contents(&pool, "d1").unwrap().is_empty());
    }

    #[test]
    fn a_second_poll_replaces_what_the_first_one_saw() {
        let pool = test_db();
        set_download_contents(&pool, "d1", &["one.mkv".into()]).unwrap();

        set_download_contents(&pool, "d1", &["one.mkv".into(), "two.mkv".into()]).unwrap();

        assert_eq!(
            download_contents(&pool, "d1").unwrap(),
            ["one.mkv", "two.mkv"]
        );
    }

    #[test]
    fn a_download_nothing_recorded_for_holds_no_file() {
        let pool = test_db();

        assert!(download_contents(&pool, "never-seen").unwrap().is_empty());
    }
}
