use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{get, send, test_app};

#[tokio::test]
async fn the_coverage_of_an_unknown_request_is_refused() {
    let t = test_app();

    let (status, _) = send(
        &t.app,
        "PUT",
        "/api/requests/nope/coverage",
        Some(&t.token),
        Some(json!({ "seasons": [1] })),
    )
    .await;

    assert_ne!(status, StatusCode::OK);
}

#[tokio::test]
async fn the_ledger_of_an_unknown_request_is_refused() {
    let t = test_app();

    let (status, _) = get(&t.app, "/api/requests/nope/ledger", Some(&t.token)).await;

    assert_ne!(status, StatusCode::OK);
}

#[tokio::test]
async fn the_season_ledger_of_an_unknown_request_is_refused() {
    let t = test_app();

    let (status, _) = get(&t.app, "/api/requests/nope/ledger/1", Some(&t.token)).await;

    assert_ne!(status, StatusCode::OK);
}

#[tokio::test]
async fn the_wanted_rows_of_an_unknown_request_are_empty() {
    let t = test_app();

    let (status, body) = get(&t.app, "/api/requests/nope/wanted", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!([]));
}
