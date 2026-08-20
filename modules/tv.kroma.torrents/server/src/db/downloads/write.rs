use anyhow::Result;
use rusqlite::params;

use crate::db::Pool;

use super::DownloadRow;

pub fn insert_download(pool: &Pool, d: &DownloadRow) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO downloads (id, client_id, client_ref, request_id, kind, tmdb_id, title, year, \
            season, episodes, release_title, indexer_id, info_hash, magnet_or_url, size_bytes, \
            score, score_breakdown, status, progress, save_path, grabbed_at, details_url, only_files, \
            upgrade) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)",
        params![
            d.id,
            d.client_id,
            d.client_ref,
            d.request_id,
            d.kind,
            d.tmdb_id as i64,
            d.title,
            d.year,
            d.season,
            d.episodes.as_ref().map(|e| serde_json::to_string(e).unwrap_or_default()),
            d.release_title,
            d.indexer_id,
            d.info_hash,
            d.magnet_or_url,
            d.size_bytes.map(|v| v as i64),
            d.score,
            d.score_breakdown,
            d.status,
            d.progress,
            d.save_path,
            d.grabbed_at,
            d.details_url,
            d.only_files.as_ref().map(|f| serde_json::to_string(f).unwrap_or_default()),
            d.upgrade
        ],
    )?;
    Ok(())
}

/// Monitor tick write: progress + status (+ save_path once known).
pub fn update_download_progress(
    pool: &Pool,
    id: &str,
    status: &str,
    progress: f64,
    save_path: Option<&str>,
    error: Option<&str>,
) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE downloads SET status = ?2, progress = ?3, \
            save_path = COALESCE(?4, save_path), error = ?5 WHERE id = ?1",
        params![id, status, progress, save_path, error],
    )?;
    Ok(())
}

pub fn mark_download_completed(pool: &Pool, id: &str, now_ms: i64) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE downloads SET status = 'completed', progress = 1.0, completed_at = ?2 WHERE id = ?1",
        params![id, now_ms],
    )?;
    Ok(())
}

pub fn mark_download_imported(pool: &Pool, id: &str, paths: &[String], now_ms: i64) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE downloads SET status = 'imported', imported_paths = ?2, imported_at = ?3, \
            error = NULL WHERE id = ?1",
        params![id, serde_json::to_string(paths).unwrap_or_default(), now_ms],
    )?;
    Ok(())
}

/// Reset a failed/removed row back to `queued` (clearing the engine ref, error
/// and progress) so a background re-add can attempt it again.
pub fn reset_download_for_retry(pool: &Pool, id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE downloads SET status = 'queued', client_ref = '', error = NULL, progress = 0, \
            completed_at = NULL, imported_at = NULL, imported_paths = NULL WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

/// Attach the engine's torrent ref once a background add resolves, and move the
/// row from `queued` to `downloading`.
pub fn activate_download(pool: &Pool, id: &str, client_ref: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE downloads SET client_ref = ?2, status = 'downloading', error = NULL WHERE id = ?1",
        params![id, client_ref],
    )?;
    Ok(())
}

/// Attach the engine ref WITHOUT changing status (a torrent that was added but
/// the row is already `paused`).
pub fn set_download_ref(pool: &Pool, id: &str, client_ref: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute("UPDATE downloads SET client_ref = ?2 WHERE id = ?1", params![id, client_ref])?;
    Ok(())
}

pub fn set_download_status(pool: &Pool, id: &str, status: &str, error: Option<&str>) -> Result<bool> {
    let conn = pool.get()?;
    let n = conn.execute(
        "UPDATE downloads SET status = ?2, error = COALESCE(?3, error) WHERE id = ?1",
        params![id, status, error],
    )?;
    Ok(n > 0)
}

pub fn delete_download_row(pool: &Pool, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    Ok(conn.execute("DELETE FROM downloads WHERE id = ?1", params![id])? > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::read::*;
    use crate::db::test_support::{download, test_db};

    #[test]
    fn downloads_insert_get_list_roundtrip() {
        let pool = test_db();

        let mut d1 = download("d1", "queued", 10);
        d1.episodes = Some(vec![1, 2, 3]);
        d1.only_files = Some(vec![0, 2]);
        d1.season = Some(2);
        d1.size_bytes = Some(2048);
        d1.tmdb_id = 99;
        d1.upgrade = true;
        insert_download(&pool, &d1).unwrap();
        insert_download(&pool, &download("d2", "downloading", 20)).unwrap();
        insert_download(&pool, &download("d3", "seeding", 30)).unwrap();

        let conn = pool.get().unwrap();

        // Field round-trip incl. JSON-encoded episodes / only_files.
        let got = get_download(&conn, "d1").unwrap().unwrap();
        assert_eq!(got.episodes, Some(vec![1, 2, 3]));
        assert_eq!(got.only_files, Some(vec![0, 2]));
        assert_eq!(got.season, Some(2));
        assert_eq!(got.size_bytes, Some(2048));
        assert_eq!(got.tmdb_id, 99);
        // The import reads this to decide whether to delete what it replaced, so
        // a flag that does not survive the ledger would silently leave duplicates.
        assert!(got.upgrade);
        assert!(!get_download(&conn, "d2").unwrap().unwrap().upgrade);
        assert_eq!(got.status, "queued");
        assert_eq!(got.title.as_deref(), Some("Dune"));
        // Columns not written by insert default to NULL.
        assert!(got.imported_paths.is_none());
        assert!(got.completed_at.is_none());

        assert!(get_download(&conn, "missing").unwrap().is_none());

        // Newest-first (grabbed_at DESC), honouring the limit.
        let ids: Vec<String> =
            list_downloads(&conn, 2).unwrap().into_iter().map(|d| d.id).collect();
        assert_eq!(ids, vec!["d3".to_string(), "d2".to_string()]);
        let ids: Vec<String> =
            list_downloads(&conn, 10).unwrap().into_iter().map(|d| d.id).collect();
        assert_eq!(ids, vec!["d3".to_string(), "d2".to_string(), "d1".to_string()]);
    }

    #[test]
    fn download_lifecycle_mutations() {
        let pool = test_db();
        insert_download(&pool, &download("d1", "queued", 10)).unwrap();

        activate_download(&pool, "d1", "cref").unwrap();
        {
            let conn = pool.get().unwrap();
            let d = get_download(&conn, "d1").unwrap().unwrap();
            assert_eq!(d.status, "downloading");
            assert_eq!(d.client_ref, "cref");
        }

        update_download_progress(&pool, "d1", "downloading", 0.5, Some("/dl/path"), None).unwrap();
        // Later tick with save_path None must not wipe the known path (COALESCE).
        update_download_progress(&pool, "d1", "seeding", 0.9, None, Some("warn")).unwrap();
        {
            let conn = pool.get().unwrap();
            let d = get_download(&conn, "d1").unwrap().unwrap();
            assert_eq!(d.status, "seeding");
            assert!((d.progress - 0.9).abs() < 1e-9);
            assert_eq!(d.save_path.as_deref(), Some("/dl/path"));
            assert_eq!(d.error.as_deref(), Some("warn"));
        }

        mark_download_completed(&pool, "d1", 12_345).unwrap();
        {
            let conn = pool.get().unwrap();
            let d = get_download(&conn, "d1").unwrap().unwrap();
            assert_eq!(d.status, "completed");
            assert!((d.progress - 1.0).abs() < 1e-9);
            assert_eq!(d.completed_at, Some(12_345));
        }

        mark_download_imported(&pool, "d1", &["/lib/a.mkv".to_string()], 67_890).unwrap();
        {
            let conn = pool.get().unwrap();
            let d = get_download(&conn, "d1").unwrap().unwrap();
            assert_eq!(d.status, "imported");
            assert_eq!(d.imported_paths, Some(vec!["/lib/a.mkv".to_string()]));
            assert_eq!(d.imported_at, Some(67_890));
            assert!(d.error.is_none());
        }

        reset_download_for_retry(&pool, "d1").unwrap();
        {
            let conn = pool.get().unwrap();
            let d = get_download(&conn, "d1").unwrap().unwrap();
            assert_eq!(d.status, "queued");
            assert_eq!(d.client_ref, "");
            assert!(d.error.is_none());
            assert!((d.progress - 0.0).abs() < 1e-9);
            assert!(d.completed_at.is_none());
            assert!(d.imported_at.is_none());
            assert!(d.imported_paths.is_none());
        }

        // set_download_ref attaches an engine ref without touching status.
        set_download_ref(&pool, "d1", "r2").unwrap();
        {
            let conn = pool.get().unwrap();
            let d = get_download(&conn, "d1").unwrap().unwrap();
            assert_eq!(d.client_ref, "r2");
            assert_eq!(d.status, "queued");
        }

        // set_download_status: sets error, then a None error is a COALESCE keep.
        assert!(set_download_status(&pool, "d1", "paused", Some("pz")).unwrap());
        assert!(set_download_status(&pool, "d1", "downloading", None).unwrap());
        {
            let conn = pool.get().unwrap();
            let d = get_download(&conn, "d1").unwrap().unwrap();
            assert_eq!(d.status, "downloading");
            assert_eq!(d.error.as_deref(), Some("pz"));
        }
        assert!(!set_download_status(&pool, "missing", "x", None).unwrap());

        assert!(delete_download_row(&pool, "d1").unwrap());
        assert!(!delete_download_row(&pool, "d1").unwrap());
        {
            let conn = pool.get().unwrap();
            assert!(get_download(&conn, "d1").unwrap().is_none());
        }
    }

    #[test]
    fn a_grab_the_database_refuses_to_record_fails_rather_than_being_lost() {
        let pool = test_db();
        pool.get()
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER refuse_download BEFORE INSERT ON downloads \
                 BEGIN SELECT RAISE(ABORT, 'read only'); END",
            )
            .unwrap();

        let err = insert_download(&pool, &download("a", "downloading", 10)).unwrap_err().to_string();

        assert!(err.contains("read only"), "{err}");
    }
}
