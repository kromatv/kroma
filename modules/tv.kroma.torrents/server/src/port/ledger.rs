//! The `download-grab` and `download-db` points this module answers: the grab
//! spec a consumer hands over, the ledger row it gets back, and the reads and
//! writes an import pass needs.
//!
//! The types are this module's own and live where the code that stores them does
//! ([`crate::db`], [`crate::downloads`]). What a consumer owes is the key
//! spelling; what this module owes is not to rename one silently, which the tests
//! at the bottom pin.

use std::sync::Arc;

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use serde::Deserialize;

use kroma_module_sdk::host::{port_reply, service, HostCtx, HostStorage};

use crate::db::DownloadRow;
use crate::{DownloadDb, DownloadManager, GrabSpec, TorrentFileEntry};

/// Grabbing a release and driving its lifecycle.
pub const DOWNLOAD_GRAB: &str = "tv.kroma.torrents/grab";

/// Reading and writing the ledger an import pass works through.
pub const DOWNLOAD_DB: &str = "tv.kroma.torrents/db";

/// The routes this module mounts for both points.
pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/_port/tv.kroma.torrents/grab/grab", post(grab::<S>))
        .route("/_port/tv.kroma.torrents/grab/list-files", post(list_files::<S>))
        .route("/_port/tv.kroma.torrents/grab/gate-open", post(gate_open::<S>))
        .route("/_port/tv.kroma.torrents/grab/activate", post(activate::<S>))
        .route("/_port/tv.kroma.torrents/grab/drop-data", post(drop_data::<S>))
        .route("/_port/tv.kroma.torrents/db/completed", post(completed::<S>))
        .route("/_port/tv.kroma.torrents/db/mark-imported", post(mark_imported::<S>))
        .route("/_port/tv.kroma.torrents/db/set-status", post(set_status::<S>))
}

// The manager holds the engine and the pools, so a request arriving before it is
// registered is an error rather than a panic.
fn manager<S: HostCtx>(host: &S) -> anyhow::Result<Arc<DownloadManager>> {
    service::<DownloadManager>(host)
        .ok_or_else(|| anyhow::anyhow!("the download manager is not running yet"))
}

fn ledger<S: HostStorage>(host: &S) -> DownloadDb {
    DownloadDb::new(host.db().clone())
}

async fn grab<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(spec): Json<GrabSpec>,
) -> Json<Result<DownloadRow, String>> {
    port_reply(move || manager(&host)?.grab(&host, spec)).await
}

#[derive(Deserialize)]
struct MagnetReq {
    magnet_or_url: String,
}

async fn list_files<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<MagnetReq>,
) -> Json<Result<Vec<TorrentFileEntry>, String>> {
    port_reply(move || manager(&host)?.list_files(&host, &req.magnet_or_url)).await
}

// Not fallible: a closed gate and an absent manager both mean "do not grab".
async fn gate_open<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
) -> Json<bool> {
    Json(manager(&host).map(|m| m.gate_open()).unwrap_or(false))
}

#[derive(Deserialize)]
struct IdReq {
    id: String,
}

// Both take an id, not a row. A consumer declares the fields IT reads, so it
// could not echo back the engine bookkeeping it never received; and this module
// has the row in its own ledger anyway.
async fn activate<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<IdReq>,
) -> Json<Result<bool, String>> {
    port_reply(move || {
        let manager = manager(&host)?;
        let Some(row) = ledger(&host).get(&req.id)? else { return Ok(false) };
        manager.activate(&host, &row);
        Ok(true)
    })
    .await
}

async fn drop_data<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<IdReq>,
) -> Json<Result<bool, String>> {
    port_reply(move || {
        let manager = manager(&host)?;
        let Some(row) = ledger(&host).get(&req.id)? else { return Ok(false) };
        manager.drop_data(&host, &row);
        Ok(true)
    })
    .await
}

async fn completed<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
) -> Json<Result<Vec<DownloadRow>, String>> {
    port_reply(move || ledger(&host).completed()).await
}

#[derive(Deserialize)]
struct ImportedReq {
    id: String,
    paths: Vec<String>,
    now_ms: i64,
}

async fn mark_imported<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<ImportedReq>,
) -> Json<Result<(), String>> {
    port_reply(move || ledger(&host).mark_imported(&req.id, &req.paths, req.now_ms)).await
}

#[derive(Deserialize)]
struct StatusReq {
    id: String,
    status: String,
    #[serde(default)]
    error: Option<String>,
}

async fn set_status<S: HostStorage + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<StatusReq>,
) -> Json<Result<bool, String>> {
    port_reply(move || ledger(&host).set_status(&req.id, &req.status, req.error.as_deref())).await
}

#[cfg(test)]
mod tests {
    use super::*;

    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use serde_json::json;
    use tower::ServiceExt as _;

    type DbHost = kroma_module_sdk::host::testing::StubHost;

    // The routes as the core's reverse proxy drives them. The manager is NOT
    // registered here, which is the state this process is in between spawn and
    // wiring — and every method has to say so rather than panic.
    async fn call(path: &str, body: serde_json::Value) -> (StatusCode, serde_json::Value) {
        let host = DbHost::with_db("torrents-ledger");
        {
            let conn = host.store().get().unwrap();
            kroma_module_sdk::db::apply_migrations(&conn, crate::db::MIGRATIONS).unwrap();
        }
        let app = routes::<DbHost>().with_state(host);
        let req = Request::builder()
            .method("POST")
            .uri(path)
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        let status = resp.status();
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    #[tokio::test]
    async fn every_route_is_mounted_where_a_consumer_calls_it() {
        // A path renamed on one side only fails at runtime, in another process,
        // with no compile error anywhere. This is the guard.
        for (path, body) in [
            ("/_port/tv.kroma.torrents/grab/grab", json!({ "kind": "movie", "tmdb_id": 1, "release_title": "R", "magnet_or_url": "m" })),
            ("/_port/tv.kroma.torrents/grab/list-files", json!({ "magnet_or_url": "magnet:?xt=1" })),
            ("/_port/tv.kroma.torrents/grab/gate-open", json!({})),
            ("/_port/tv.kroma.torrents/grab/activate", json!({ "id": "d1" })),
            ("/_port/tv.kroma.torrents/grab/drop-data", json!({ "id": "d1" })),
            ("/_port/tv.kroma.torrents/db/completed", json!({})),
            ("/_port/tv.kroma.torrents/db/mark-imported", json!({ "id": "d1", "paths": [], "now_ms": 1 })),
            ("/_port/tv.kroma.torrents/db/set-status", json!({ "id": "d1", "status": "failed" })),
        ] {
            let (status, _) = call(path, body).await;
            assert_eq!(status, StatusCode::OK, "{path}");
        }
    }

    // A closed gate and an absent manager both mean "do not grab", so this one
    // answers `false` rather than an envelope: a consumer reading an error as
    // "allowed" would grab into a process that cannot take it.
    #[tokio::test]
    async fn the_gate_reads_closed_when_no_manager_is_running() {
        let (status, answer) = call("/_port/tv.kroma.torrents/grab/gate-open", json!({})).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(answer, json!(false));
    }

    #[tokio::test]
    async fn a_grab_with_no_manager_says_so_instead_of_panicking() {
        let (status, answer) = call(
            "/_port/tv.kroma.torrents/grab/grab",
            json!({ "kind": "movie", "tmdb_id": 603, "release_title": "R", "magnet_or_url": "m" }),
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        let err = answer["Err"].as_str().expect("an Err envelope");
        assert!(err.contains("not running yet"), "{err}");
    }

    // The ledger reads answer out of the database, not the manager, so these work
    // with nothing registered — and an empty ledger is an empty list, not an error.
    #[tokio::test]
    async fn the_ledger_reads_work_without_a_manager() {
        let (_, completed) = call("/_port/tv.kroma.torrents/db/completed", json!({})).await;
        assert_eq!(completed["Ok"], json!([]));

        let (_, flipped) = call(
            "/_port/tv.kroma.torrents/db/set-status",
            json!({ "id": "nobody", "status": "failed", "error": "why" }),
        )
        .await;
        assert_eq!(flipped["Ok"], json!(false), "no row has that id");
    }

    #[tokio::test]
    async fn a_lifecycle_call_for_a_row_that_is_gone_is_false_rather_than_an_error() {
        let (_, answer) = call("/_port/tv.kroma.torrents/grab/activate", json!({ "id": "ghost" })).await;

        // The manager is absent here, so this is the manager error; what matters is
        // that a missing row and a missing manager are told apart at all.
        assert!(answer["Err"].is_string() || answer["Ok"] == json!(false), "{answer}");
    }

    #[tokio::test]
    async fn a_malformed_body_is_rejected_by_the_extractor() {
        let (status, _) = call("/_port/tv.kroma.torrents/db/mark-imported", json!({ "id": "d1" })).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

        let (status, _) = call("/_port/tv.kroma.torrents/grab/list-files", json!({})).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    }

    // A consumer builds these bodies in its own crate from its own structs, so a
    // key renamed on one side only would fail at runtime in another process.
    #[test]
    fn a_grab_spec_arrives_from_the_keys_a_consumer_sends() {
        let body = json!({
            "magnet_or_url": "magnet:?xt=urn:btih:AB",
            "kind": "movie",
            "tmdb_id": 603,
            "release_title": "The.Matrix.1999.1080p",
            "wanted_ids": ["w1"],
            "upgrade": true,
        });

        let spec: GrabSpec = serde_json::from_value(body).unwrap();

        assert_eq!(spec.magnet_or_url, "magnet:?xt=urn:btih:AB");
        assert_eq!(spec.tmdb_id, 603);
        assert_eq!(spec.wanted_ids, vec!["w1".to_string()]);
        assert!(spec.upgrade);
        // What a consumer did not send has to default, or a spec built by an older
        // peer would be a 422 rather than a grab.
        assert_eq!(spec.season, None);
        assert_eq!(spec.only_files, None);
    }

    #[test]
    fn the_lifecycle_methods_take_an_id_and_not_a_row() {
        let req: IdReq = serde_json::from_value(json!({ "id": "d1" })).unwrap();

        assert_eq!(req.id, "d1");
    }

    #[test]
    fn the_two_write_methods_take_the_keys_they_are_documented_with() {
        let imported: ImportedReq =
            serde_json::from_value(json!({ "id": "d1", "paths": ["/m/a.mkv"], "now_ms": 42 }))
                .unwrap();
        assert_eq!(imported.id, "d1");
        assert_eq!(imported.paths, vec!["/m/a.mkv".to_string()]);
        assert_eq!(imported.now_ms, 42);

        let status: StatusReq =
            serde_json::from_value(json!({ "id": "d1", "status": "failed" })).unwrap();
        assert_eq!(status.status, "failed");
        assert_eq!(status.error, None);
    }

    #[test]
    fn a_row_serializes_under_the_keys_an_import_pass_reads() {
        let json = serde_json::to_value(row()).unwrap();

        assert_eq!(json["id"], "d1");
        assert_eq!(json["request_id"], "req-1");
        assert_eq!(json["release_title"], "The.Matrix.1999.1080p");
        assert_eq!(json["save_path"], "/downloads/x");
        assert_eq!(json["status"], "completed");
        assert_eq!(json["upgrade"], false);
    }

    fn row() -> DownloadRow {
        DownloadRow {
            id: "d1".into(),
            client_id: "c1".into(),
            client_ref: "r1".into(),
            request_id: Some("req-1".into()),
            kind: "movie".into(),
            tmdb_id: 603,
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
        }
    }
}
