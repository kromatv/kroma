//! Every route the ledger port mounts, answered against a real migrated store.

use super::*;

#[tokio::test]
async fn every_route_is_mounted_where_a_consumer_calls_it() {
    for (path, body) in [
        (
            "/_port/tv.kroma.torrents/grab/grab",
            json!({ "kind": "movie", "tmdb_id": 1, "release_title": "R", "magnet_or_url": "m" }),
        ),
        (
            "/_port/tv.kroma.torrents/grab/list-files",
            json!({ "magnet_or_url": "magnet:?xt=1" }),
        ),
        ("/_port/tv.kroma.torrents/grab/gate-open", json!({})),
        (
            "/_port/tv.kroma.torrents/grab/activate",
            json!({ "id": "d1" }),
        ),
        (
            "/_port/tv.kroma.torrents/grab/drop-data",
            json!({ "id": "d1" }),
        ),
        ("/_port/tv.kroma.torrents/db/completed", json!({})),
        (
            "/_port/tv.kroma.torrents/db/mark-imported",
            json!({ "id": "d1", "paths": [], "now_ms": 1 }),
        ),
        (
            "/_port/tv.kroma.torrents/db/set-status",
            json!({ "id": "d1", "status": "failed" }),
        ),
    ] {
        let (status, _) = call(path, body).await;
        assert_eq!(status, StatusCode::OK, "{path}");
    }
}

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
    let host = with_manager(migrated_host());

    let (_, answer) = post(
        host,
        "/_port/tv.kroma.torrents/grab/activate",
        json!({ "id": "ghost" }),
    )
    .await;

    assert_eq!(answer["Ok"], json!(false));
}

#[tokio::test]
async fn activating_a_row_the_ledger_holds_reaches_the_manager() {
    let host = with_manager(migrated_host());
    seed_row(&host, "d1");

    let (_, answer) = post(
        host.clone(),
        "/_port/tv.kroma.torrents/grab/activate",
        json!({ "id": "d1" }),
    )
    .await;

    let conn = host.db().get().unwrap();
    let row = crate::db::get_download(&conn, "d1").unwrap().unwrap();
    assert_eq!(answer["Ok"], json!(true));
    assert_eq!(row.status, "failed");
    assert_eq!(row.error.as_deref(), Some("download client unavailable"));
}

#[tokio::test]
async fn dropping_the_data_of_a_row_that_is_gone_is_false_rather_than_an_error() {
    let host = with_manager(migrated_host());

    let (_, answer) = post(
        host,
        "/_port/tv.kroma.torrents/grab/drop-data",
        json!({ "id": "ghost" }),
    )
    .await;

    assert_eq!(answer["Ok"], json!(false));
}

#[tokio::test]
async fn dropping_the_data_of_a_row_leaves_the_row_in_the_ledger() {
    let host = with_manager(migrated_host());
    seed_row(&host, "d1");

    let (_, answer) = post(
        host.clone(),
        "/_port/tv.kroma.torrents/grab/drop-data",
        json!({ "id": "d1" }),
    )
    .await;

    let conn = host.db().get().unwrap();
    assert_eq!(answer["Ok"], json!(true));
    assert!(crate::db::get_download(&conn, "d1").unwrap().is_some());
}

#[tokio::test]
async fn a_malformed_body_is_rejected_by_the_extractor() {
    let (status, _) = call(
        "/_port/tv.kroma.torrents/db/mark-imported",
        json!({ "id": "d1" }),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    let (status, _) = call("/_port/tv.kroma.torrents/grab/list-files", json!({})).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}
