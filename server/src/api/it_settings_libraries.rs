//! `PUT /api/admin/settings` and the `libraries` key: a value that is not a
//! list of libraries never reaches the store.

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{send, test_app, TestApp};

async fn put_settings(t: &TestApp, patch: serde_json::Value) -> (StatusCode, serde_json::Value) {
    send(
        &t.app,
        "PUT",
        "/api/admin/settings",
        Some(&t.token),
        Some(patch),
    )
    .await
}

#[tokio::test]
async fn settings_put_refuses_a_libraries_value_that_is_not_a_list_of_libraries() {
    let t = test_app();
    let saved = t.state.settings.get("libraries");

    let (status, body) = put_settings(
        &t,
        json!({ "libraries": [{ "name": "Films" }], "serverName": "Renamed" }),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"]
        .as_str()
        .is_some_and(|error| error.contains("libraries")));
    assert_eq!(t.state.settings.get("libraries"), saved);
    assert_eq!(t.state.settings.get("serverName"), json!("KROMA"));
}

#[tokio::test]
async fn settings_put_takes_a_libraries_value_that_reads_as_the_list() {
    let t = test_app();
    let list = json!([{ "id": "lib-1", "name": "Films", "folders": ["/media/films"] }]);

    let (status, body) = put_settings(&t, json!({ "libraries": list })).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["updated"], json!(["libraries"]));
    assert_eq!(t.state.settings.get("libraries"), list);
}
