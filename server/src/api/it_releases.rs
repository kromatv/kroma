use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{get, seed_session, send, test_app, TestApp};
use crate::model::Permission;

const VERSION: &str = env!("CARGO_PKG_VERSION");

fn member(t: &TestApp) -> String {
    seed_session(&t.state, "ana@test.dev", "ana", &[Permission::Playback]).1
}

fn releases(body: &Value) -> &Vec<Value> {
    body["releases"].as_array().expect("releases is an array")
}

fn newest_with_highlights(body: &Value) -> Value {
    releases(body)
        .iter()
        .find(|release| !release["highlights"].as_array().unwrap().is_empty())
        .map_or(Value::Null, |release| release["version"].clone())
}

#[tokio::test]
async fn the_list_names_the_running_version_and_no_release_past_it() {
    let t = test_app();

    let (status, body) = get(&t.app, "/api/releases", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["current"], json!(VERSION));
    assert!(releases(&body).iter().any(|release| release["version"] == json!(VERSION)));
}

#[tokio::test]
async fn a_member_is_shown_neither_the_action_nor_the_owner_lines() {
    let t = test_app();
    let ana = member(&t);

    let (_, body) = get(&t.app, "/api/releases", Some(&ana)).await;

    for release in releases(&body) {
        assert_eq!(release["action"], json!([]));
        assert_eq!(release["owner"], json!([]));
    }
}

#[tokio::test]
async fn an_account_that_never_saw_a_release_is_offered_the_newest_one_with_highlights() {
    let t = test_app();
    let ana = member(&t);

    let (_, body) = get(&t.app, "/api/releases", Some(&ana)).await;

    assert_eq!(body["unseen"], newest_with_highlights(&body));
}

#[tokio::test]
async fn marking_the_running_release_seen_leaves_nothing_unseen() {
    let t = test_app();
    let ana = member(&t);

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/releases/seen",
        Some(&ana),
        Some(json!({ "version": VERSION })),
    )
    .await;
    let (_, body) = get(&t.app, "/api/releases", Some(&ana)).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(body["unseen"], Value::Null);
}

#[tokio::test]
async fn a_version_past_the_running_one_is_refused() {
    let t = test_app();
    let ana = member(&t);

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/releases/seen",
        Some(&ana),
        Some(json!({ "version": "999.0.0" })),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}
