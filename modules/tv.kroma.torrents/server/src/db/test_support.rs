use rusqlite::params;

use kroma_module_sdk::db::testing::TempPool;

use super::{apply_migrations, DownloadClientRow, DownloadRow, Pool, MIGRATIONS};

// A fresh temp DB with the core schema (via `temp_pool`, so the `requests`
// table the downloads FK points at exists) plus this module's own tables.
pub(super) fn test_db() -> TempPool {
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
        tmdb_id: 42,
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
    }
}

// Seeds a bare `requests` row so a download's `request_id` FK is satisfiable.
pub(super) fn seed_request(pool: &Pool, id: &str) {
    pool.get()
        .unwrap()
        .execute(
            "INSERT INTO requests (id,kind,tmdb_id,title,status,created_at,updated_at) \
             VALUES (?1,'movie',1,'T','pending',0,0)",
            params![id],
        )
        .unwrap();
}
