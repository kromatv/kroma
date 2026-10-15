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
        client_id: Some("embedded".into()),
        ..Default::default()
    };

    let json = serde_json::to_value(&spec).unwrap();

    assert_eq!(json["magnet_or_url"], "magnet:?xt=urn:btih:AB");
    assert_eq!(json["tmdb_id"], 603);
    assert_eq!(json["release_title"], "The.Matrix.1999.1080p");
    assert_eq!(json["wanted_ids"][0], "w1");
    assert_eq!(json["upgrade"], true);
    assert_eq!(json["client_id"], "embedded");
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
    let resolve = kroma_module_sdk::testing::serve(fake_ledger(), ()).await;
    let (base, token) = resolve().expect("the fake ledger is up");
    StubHost::new()
        .with_point(DOWNLOAD_GRAB, None, &base, &token)
        .with_point(DOWNLOAD_DB, None, &base, &token)
}

#[tokio::test(flavor = "multi_thread")]
async fn a_grab_crosses_and_the_row_comes_back() {
    let host = ledger_host().await;

    let row = kroma_module_sdk::testing::blocking(move || {
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

    let (open, files) = kroma_module_sdk::testing::blocking(move || {
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

    let outcome = kroma_module_sdk::testing::blocking(move || {
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

    kroma_module_sdk::testing::blocking(move || {
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
