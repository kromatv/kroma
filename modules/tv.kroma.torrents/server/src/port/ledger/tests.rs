//! Shared fixtures for the ledger port's suites.

use std::sync::Arc;

use axum::http::StatusCode;
use kroma_module_sdk::host::HostCtx as _;
use serde_json::json;

use super::*;
use crate::DownloadManager;

type DbHost = kroma_module_sdk::host::testing::StubHost;

fn migrated_host() -> DbHost {
    let host = DbHost::with_core(kroma_module_sdk::db::testing::temp_pool("torrents-ledger"));
    let conn = host.store().get().unwrap();
    kroma_module_sdk::db::apply_migrations(&conn, crate::db::MIGRATIONS).unwrap();
    drop(conn);
    host
}

fn with_manager(host: DbHost) -> DbHost {
    let manager = DownloadManager::new(
        Arc::new(host.clone()),
        host.data_dir(),
        host.db().clone(),
        host.store().clone(),
    );
    host.with_service(manager)
}

fn seed_row(host: &DbHost, id: &str) {
    crate::db::insert_download(host.db(), &row_with_id(id)).unwrap();
}

// The manager is NOT registered here, which is the state this process is in
// between spawn and wiring.
async fn call(path: &str, body: serde_json::Value) -> (StatusCode, serde_json::Value) {
    post(migrated_host(), path, body).await
}

async fn post(
    host: DbHost,
    path: &str,
    body: serde_json::Value,
) -> (StatusCode, serde_json::Value) {
    super::super::post(routes(), host, path, body).await
}

fn row_with_id(id: &str) -> DownloadRow {
    DownloadRow {
        id: id.into(),
        request_id: None,
        client_ref: String::new(),
        status: "queued".into(),
        ..row()
    }
}

fn row() -> DownloadRow {
    DownloadRow {
        id: "d1".into(),
        client_id: "c1".into(),
        client_ref: "r1".into(),
        request_id: Some("req-1".into()),
        kind: "movie".into(),
        tmdb_id: Some(603),
        title: Some("The Matrix".into()),
        year: Some(1999),
        season: None,
        episodes: None,
        release_title: "The.Matrix.1999.1080p".into(),
        indexer_id: Some("idx".into()),
        info_hash: None,
        magnet_or_url: "magnet:?xt=urn:btih:AB".into(),
        size_bytes: Some(42),
        score: Some(7),
        score_breakdown: None,
        status: "completed".into(),
        progress: 1.0,
        save_path: Some("/downloads/x".into()),
        imported_paths: None,
        error: None,
        grabbed_at: 1,
        completed_at: Some(2),
        imported_at: None,
        details_url: None,
        only_files: None,
        upgrade: false,
        lifetime_downloaded_bytes: 0,
        lifetime_uploaded_bytes: 0,
        match_source: None,
    }
}

mod keys;
mod routes;
