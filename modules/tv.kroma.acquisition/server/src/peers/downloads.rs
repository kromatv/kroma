//! The `download-grab` and `download-db` points this module calls: hand over a
//! release to grab, then work the ledger the import pass reads.
//!
//! The structs are this module's own. `GrabSpec` is what it sends and `DownloadRow`
//! is the subset of the ledger row the import pass reads: the engine's own
//! bookkeeping (which client holds the torrent, its progress, when it was grabbed)
//! is not this module's business and no longer crosses.

use serde::{Deserialize, Serialize};

use kroma_module_sdk::host::{call, call_raw, pinned_resolver, HostCtx, Resolver};

/// Grabbing a release and driving its lifecycle.
pub const DOWNLOAD_GRAB: &str = "tv.kroma.torrents/grab";

/// The ledger an import pass works through.
pub const DOWNLOAD_DB: &str = "tv.kroma.torrents/db";

/// Everything the queue needs to grab a release and let it be imported. Built
/// from a scored release (automatic or interactive) or from admin-entered fields
/// (manual add, plain magnet). `upgrade` means it replaces media already on disk,
/// so the import takes the destination and clears what it superseded instead of
/// landing beside it.
#[derive(Debug, Clone, Default, Serialize)]
pub struct GrabSpec {
    pub magnet_or_url: String,
    pub kind: String,
    pub tmdb_id: u64,
    pub title: Option<String>,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episodes: Option<Vec<u32>>,
    pub release_title: String,
    pub indexer_id: Option<String>,
    pub size_bytes: Option<u64>,
    pub score: Option<i32>,
    pub score_breakdown: Option<String>,
    pub request_id: Option<String>,
    pub wanted_ids: Vec<String>,
    pub only_files: Option<Vec<usize>>,
    pub details_url: Option<String>,
    pub upgrade: bool,
}

/// A ledger row, as the import pass reads it. Tolerant: the module that keeps the
/// ledger is released separately, so a field it adds is ignored here and one it
/// stops sending defaults rather than failing the whole import sweep.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct DownloadRow {
    pub id: String,
    pub request_id: Option<String>,
    pub kind: String,
    pub tmdb_id: u64,
    pub title: Option<String>,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episodes: Option<Vec<u32>>,
    pub release_title: String,
    pub indexer_id: Option<String>,
    pub magnet_or_url: String,
    pub size_bytes: Option<u64>,
    pub score: Option<i32>,
    pub status: String,
    pub save_path: Option<String>,
    pub error: Option<String>,
    pub details_url: Option<String>,
    pub only_files: Option<Vec<usize>>,
    pub upgrade: bool,
}

/// One file inside a torrent, from a metadata-only listing.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct TorrentFileEntry {
    pub index: usize,
    pub path: String,
    pub size_bytes: u64,
}

/// Grab a release: the queue records it and hands it to the engine.
pub fn grab(host: &dyn HostCtx, spec: &GrabSpec) -> anyhow::Result<DownloadRow> {
    call(&grabber(host)?, &format!("{DOWNLOAD_GRAB}/grab"), spec)
}

/// A torrent's files without downloading it, so the admin can select before
/// committing.
pub fn list_files(
    host: &dyn HostCtx,
    magnet_or_url: &str,
) -> anyhow::Result<Vec<TorrentFileEntry>> {
    call(
        &grabber(host)?,
        &format!("{DOWNLOAD_GRAB}/list-files"),
        &serde_json::json!({ "magnet_or_url": magnet_or_url }),
    )
}

/// Whether the kill switch currently allows new grabs. A missing engine reads as
/// closed, because a grab that cannot be handed anywhere is not a grab.
pub fn gate_open(host: &dyn HostCtx) -> bool {
    let Ok(resolve) = grabber(host) else {
        return false;
    };
    call_raw(
        &resolve,
        &format!("{DOWNLOAD_GRAB}/gate-open"),
        &serde_json::json!({}),
    )
    .unwrap_or(false)
}

/// Kick a freshly recorded row into the engine. Best effort: the row is already in
/// the ledger, so the engine picks it up on its next sweep either way.
pub fn activate(host: &dyn HostCtx, id: &str) {
    if let Err(e) = lifecycle(host, "activate", id) {
        tracing::warn!(target: "acquisition", download = %id, "could not start the download: {e:#}");
    }
}

/// Free a download's data and stop seeding, once its files were imported.
pub fn drop_data(host: &dyn HostCtx, id: &str) {
    if let Err(e) = lifecycle(host, "drop-data", id) {
        tracing::warn!(target: "acquisition", download = %id, "could not free the download: {e:#}");
    }
}

fn lifecycle(host: &dyn HostCtx, method: &str, id: &str) -> anyhow::Result<bool> {
    call(
        &grabber(host)?,
        &format!("{DOWNLOAD_GRAB}/{method}"),
        &serde_json::json!({ "id": id }),
    )
}

/// Rows the engine finished and nothing has imported yet.
pub fn completed(host: &dyn HostCtx) -> anyhow::Result<Vec<DownloadRow>> {
    call(
        &ledger(host)?,
        &format!("{DOWNLOAD_DB}/completed"),
        &serde_json::json!({}),
    )
}

/// Record where an import landed a row's files.
pub fn mark_imported(
    host: &dyn HostCtx,
    id: &str,
    paths: &[String],
    now_ms: i64,
) -> anyhow::Result<()> {
    call(
        &ledger(host)?,
        &format!("{DOWNLOAD_DB}/mark-imported"),
        &serde_json::json!({ "id": id, "paths": paths, "now_ms": now_ms }),
    )
}

/// Move a row to `status`, with the reason when it failed.
pub fn set_status(
    host: &dyn HostCtx,
    id: &str,
    status: &str,
    error: Option<&str>,
) -> anyhow::Result<bool> {
    call(
        &ledger(host)?,
        &format!("{DOWNLOAD_DB}/set-status"),
        &serde_json::json!({ "id": id, "status": status, "error": error }),
    )
}

fn grabber(host: &dyn HostCtx) -> anyhow::Result<Resolver> {
    resolve(host, DOWNLOAD_GRAB)
}

fn ledger(host: &dyn HostCtx) -> anyhow::Result<Resolver> {
    resolve(host, DOWNLOAD_DB)
}

fn resolve(host: &dyn HostCtx, point: &str) -> anyhow::Result<Resolver> {
    pinned_resolver(host, point, None)
        .ok_or_else(|| anyhow::anyhow!("no module answers the {point} point"))
}

#[cfg(test)]
mod tests {
    use super::*;

    use kroma_module_sdk::host::testing::StubHost;

    #[test]
    fn a_spec_crosses_under_the_keys_the_provider_parses() {
        let spec = GrabSpec {
            magnet_or_url: "magnet:?xt=urn:btih:AB".into(),
            kind: "movie".into(),
            tmdb_id: 603,
            release_title: "The.Matrix.1999.1080p".into(),
            wanted_ids: vec!["w1".into()],
            upgrade: true,
            ..Default::default()
        };

        let json = serde_json::to_value(&spec).unwrap();

        assert_eq!(json["magnet_or_url"], "magnet:?xt=urn:btih:AB");
        assert_eq!(json["tmdb_id"], 603);
        assert_eq!(json["release_title"], "The.Matrix.1999.1080p");
        assert_eq!(json["wanted_ids"][0], "w1");
        assert_eq!(json["upgrade"], true);
    }

    // The provider's row carries engine bookkeeping this module does not read, and
    // may carry fields it has not heard of; neither may fail the import sweep.
    #[test]
    fn a_row_deserializes_past_the_fields_this_module_ignores() {
        let json = serde_json::json!({
            "id": "d1",
            "request_id": "req-1",
            "kind": "movie",
            "tmdb_id": 603,
            "release_title": "The.Matrix.1999.1080p",
            "magnet_or_url": "magnet:?xt=urn:btih:AB",
            "status": "completed",
            "save_path": "/downloads/x",
            "client_ref": "engine-internal",
            "progress": 1.0,
            "invented_later": true,
        });

        let row: DownloadRow = serde_json::from_value(json).unwrap();

        assert_eq!(row.id, "d1");
        assert_eq!(row.request_id.as_deref(), Some("req-1"));
        assert_eq!(row.save_path.as_deref(), Some("/downloads/x"));
        assert_eq!(row.status, "completed");
        assert!(!row.upgrade);
    }

    // A fake ledger module. Driving the client against THIS is the only way to
    // catch a key renamed on one side only, because the two ends share no type.
    fn fake_ledger() -> axum::Router<()> {
        use axum::routing::post;
        use axum::Json;
        use serde_json::Value;

        async fn grab(Json(spec): Json<Value>) -> Json<Result<Value, String>> {
            Json(Ok(serde_json::json!({
                "id": "d1",
                "request_id": spec["request_id"],
                "kind": spec["kind"],
                "tmdb_id": spec["tmdb_id"],
                "release_title": spec["release_title"],
                "magnet_or_url": spec["magnet_or_url"],
                "status": "grabbed",
                // Engine bookkeeping the consumer does not declare; it must be
                // ignored rather than fail the deserialize.
                "client_id": "c1",
                "client_ref": "r1",
                "progress": 0.0,
                "grabbed_at": 1,
            })))
        }

        async fn list_files(Json(_): Json<Value>) -> Json<Result<Vec<Value>, String>> {
            Json(Ok(vec![
                serde_json::json!({ "index": 0, "path": "a.mkv", "size_bytes": 42 }),
            ]))
        }

        async fn gate_open(Json(_): Json<Value>) -> Json<bool> {
            Json(true)
        }

        async fn lifecycle(Json(req): Json<Value>) -> Json<Result<bool, String>> {
            Json(Ok(req["id"] == "d1"))
        }

        async fn completed(Json(_): Json<Value>) -> Json<Result<Vec<Value>, String>> {
            Json(Ok(vec![serde_json::json!({
                "id": "done",
                "kind": "movie",
                "tmdb_id": 603,
                "release_title": "The.Matrix.1999.1080p",
                "magnet_or_url": "magnet:?xt=1",
                "status": "completed",
                "save_path": "/downloads/x",
            })]))
        }

        async fn mark_imported(Json(req): Json<Value>) -> Json<Result<(), String>> {
            assert_eq!(req["now_ms"], 42);
            assert_eq!(req["paths"][0], "/media/a.mkv");
            Json(Ok(()))
        }

        async fn set_status(Json(req): Json<Value>) -> Json<Result<bool, String>> {
            Json(Ok(req["status"] == "completed"))
        }

        axum::Router::new()
            .route("/_port/tv.kroma.torrents/grab/grab", post(grab))
            .route("/_port/tv.kroma.torrents/grab/list-files", post(list_files))
            .route("/_port/tv.kroma.torrents/grab/gate-open", post(gate_open))
            .route("/_port/tv.kroma.torrents/grab/activate", post(lifecycle))
            .route("/_port/tv.kroma.torrents/grab/drop-data", post(lifecycle))
            .route("/_port/tv.kroma.torrents/db/completed", post(completed))
            .route(
                "/_port/tv.kroma.torrents/db/mark-imported",
                post(mark_imported),
            )
            .route("/_port/tv.kroma.torrents/db/set-status", post(set_status))
    }

    async fn ledger_host() -> StubHost {
        let resolve = kroma_module_host::test_serve::serve(fake_ledger(), ()).await;
        let (base, token) = resolve().expect("the fake ledger is up");
        StubHost::new()
            .with_point(DOWNLOAD_GRAB, None, &base, &token)
            .with_point(DOWNLOAD_DB, None, &base, &token)
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_grab_crosses_and_the_row_comes_back() {
        let host = ledger_host().await;

        let row = kroma_module_host::test_serve::blocking(move || {
            grab(
                &host,
                &GrabSpec {
                    magnet_or_url: "magnet:?xt=urn:btih:AB".into(),
                    kind: "movie".into(),
                    tmdb_id: 603,
                    release_title: "The.Matrix.1999.1080p".into(),
                    request_id: Some("req-1".into()),
                    ..Default::default()
                },
            )
        })
        .await
        .unwrap();

        assert_eq!(row.id, "d1");
        assert_eq!(row.request_id.as_deref(), Some("req-1"));
        assert_eq!(row.tmdb_id, 603);
        assert_eq!(row.status, "grabbed");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_gate_and_the_file_listing_answer() {
        let host = ledger_host().await;

        let (open, files) = kroma_module_host::test_serve::blocking(move || {
            (gate_open(&host), list_files(&host, "magnet:?xt=1"))
        })
        .await;

        assert!(open);
        let files = files.unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "a.mkv");
        assert_eq!(files[0].size_bytes, 42);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_import_pass_reads_and_writes_the_ledger() {
        let host = ledger_host().await;

        let outcome = kroma_module_host::test_serve::blocking(move || {
            let ready = completed(&host)?;
            mark_imported(&host, "done", &["/media/a.mkv".to_string()], 42)?;
            let flipped = set_status(&host, "done", "completed", Some("why"))?;
            anyhow::Ok((ready, flipped))
        })
        .await
        .unwrap();

        let (ready, flipped) = outcome;
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].id, "done");
        assert_eq!(ready[0].save_path.as_deref(), Some("/downloads/x"));
        assert!(flipped);
    }

    // Best effort by design: the row is already in the ledger, so a lifecycle call
    // that cannot be delivered must not propagate.
    #[tokio::test(flavor = "multi_thread")]
    async fn the_lifecycle_calls_never_propagate_a_failure() {
        let host = ledger_host().await;

        kroma_module_host::test_serve::blocking(move || {
            activate(&host, "d1");
            drop_data(&host, "d1");
            // Neither of these is delivered anywhere, and neither may panic.
            let absent = StubHost::new();
            activate(&absent, "d1");
            drop_data(&absent, "d1");
        })
        .await;
    }

    #[test]
    fn no_engine_means_the_gate_is_closed_rather_than_open() {
        // A grab that cannot be handed anywhere must not read as permitted.
        let host = StubHost::new();

        assert!(!gate_open(&host));
        assert!(completed(&host).is_err());
        assert!(grab(&host, &GrabSpec::default()).is_err());
    }
}
