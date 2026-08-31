use rusqlite::params;

use kroma_module_sdk::db::testing::TempPool;

use super::{apply_migrations, DownloadClientRow, DownloadRow, Pool, MIGRATIONS};

// A fresh temp DB with the core schema (via `temp_pool`, so the `requests`
// table the downloads FK points at exists) plus this module's own tables.
pub(crate) fn test_db() -> TempPool {
    let pool = kroma_module_sdk::db::testing::temp_pool("torrents-test");
    {
        let conn = pool.get().unwrap();
        apply_migrations(&conn, MIGRATIONS).unwrap();
    }
    pool
}

pub(super) fn client(id: &str, priority: i32, enabled: bool, created_at: i64) -> DownloadClientRow {
    DownloadClientRow {
        id: id.into(),
        kind: "rqbit".into(),
        name: format!("Client {id}"),
        url: "http://host".into(),
        username: "user".into(),
        password: "secret".into(),
        enabled,
        priority,
        created_at,
    }
}

pub(super) fn download(id: &str, status: &str, grabbed_at: i64) -> DownloadRow {
    DownloadRow {
        id: id.into(),
        client_id: "embedded".into(),
        client_ref: String::new(),
        request_id: None,
        kind: "movie".into(),
        tmdb_id: Some(42),
        title: Some("Dune".into()),
        year: Some(2021),
        season: None,
        episodes: None,
        release_title: format!("Rel.{id}.mkv"),
        indexer_id: None,
        info_hash: None,
        magnet_or_url: format!("magnet:?xt=urn:btih:{id}"),
        size_bytes: Some(1024),
        score: Some(5),
        score_breakdown: None,
        status: status.into(),
        progress: 0.0,
        save_path: None,
        imported_paths: None,
        error: None,
        grabbed_at,
        completed_at: None,
        imported_at: None,
        details_url: None,
        only_files: None,
        upgrade: false,
        lifetime_downloaded_bytes: 0,
        lifetime_uploaded_bytes: 0,
        match_source: None,
    }
}

// Seeds a bare `requests` row so a download's `request_id` FK is satisfiable.
pub(super) fn seed_request(pool: &Pool, id: &str, title: &str) {
    pool.get()
        .unwrap()
        .execute(
            "INSERT INTO requests (id,kind,tmdb_id,title,status,created_at,updated_at) \
             VALUES (?1,'movie',1,?2,'pending',0,0)",
            params![id, title],
        )
        .unwrap();
}

pub(super) fn seeded_ledger() -> TempPool {
    let pool = test_db();
    for (id, status, at) in [
        ("d_q", "queued", 10),
        ("d_d", "downloading", 20),
        ("d_s", "seeding", 30),
        ("d_c", "completed", 40),
        ("d_f", "failed", 50),
    ] {
        super::insert_download(&pool, &download(id, status, at)).unwrap();
    }
    pool
}
