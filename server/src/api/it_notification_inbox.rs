use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{get, seed_session, send, test_app, TestApp};
use crate::model::{Audience, NotificationEvent, NotificationSpec, Permission};

fn member(t: &TestApp, tag: &str) -> (String, String) {
    seed_session(
        &t.state,
        &format!("{tag}@test.dev"),
        tag,
        &[Permission::Playback],
    )
}

fn notify_user(t: &TestApp, user_id: &str, title: &str) {
    let spec = NotificationSpec::new(
        NotificationEvent::RequestAvailable,
        "notifications.request.available.title",
        "notifications.request.available.body",
    )
    .param("title", title);
    crate::services::notify::emit(&t.state, &Audience::user(user_id), &spec);
}

async fn first_id(t: &TestApp, token: &str) -> String {
    let (_, inbox) = get(&t.app, "/api/notifications", Some(token)).await;
    inbox["notifications"][0]["id"]
        .as_str()
        .unwrap()
        .to_string()
}

async fn post(t: &TestApp, path: &str, token: &str, body: Value) -> (StatusCode, Value) {
    send(&t.app, "POST", path, Some(token), Some(body)).await
}

#[tokio::test]
async fn the_badge_counts_unseen_rows_and_opening_the_panel_clears_it() {
    let t = test_app();
    let (ana_id, ana) = member(&t, "seen-ana");
    notify_user(&t, &ana_id, "Dune");
    notify_user(&t, &ana_id, "Arrival");

    let (_, before) = get(&t.app, "/api/notifications", Some(&ana)).await;
    let (status, after) = post(&t, "/api/notifications/seen", &ana, json!({})).await;

    assert_eq!(before["unseen"], json!(2));
    assert_eq!(status, StatusCode::OK);
    assert_eq!(after, json!({ "unread": 2, "unseen": 0 }));
}

#[tokio::test]
async fn an_archived_row_moves_from_the_inbox_to_the_archive_and_back() {
    let t = test_app();
    let (ana_id, ana) = member(&t, "archive-ana");
    notify_user(&t, &ana_id, "Dune");
    let id = first_id(&t, &ana).await;

    let (_, archived) = post(
        &t,
        "/api/notifications/archive",
        &ana,
        json!({ "ids": [id] }),
    )
    .await;
    let (_, inbox) = get(&t.app, "/api/notifications", Some(&ana)).await;
    let (_, shelf) = get(&t.app, "/api/notifications?archived=true", Some(&ana)).await;
    let (_, restored) = post(
        &t,
        "/api/notifications/unarchive",
        &ana,
        json!({ "ids": [id] }),
    )
    .await;

    assert_eq!(archived, json!({ "unread": 0, "unseen": 0 }));
    assert_eq!(inbox["notifications"].as_array().unwrap().len(), 0);
    assert_eq!(shelf["notifications"][0]["id"], json!(id));
    assert_eq!(restored["unread"], json!(1));
}

#[tokio::test]
async fn archiving_what_was_read_keeps_the_unread_rows_in_the_inbox() {
    let t = test_app();
    let (ana_id, ana) = member(&t, "archive-read-ana");
    notify_user(&t, &ana_id, "Dune");
    let read = first_id(&t, &ana).await;
    post(
        &t,
        "/api/notifications/read",
        &ana,
        json!({ "ids": [read] }),
    )
    .await;
    notify_user(&t, &ana_id, "Arrival");

    let (status, counts) = post(&t, "/api/notifications/archive/read", &ana, json!({})).await;

    let (_, inbox) = get(&t.app, "/api/notifications", Some(&ana)).await;
    let (_, shelf) = get(&t.app, "/api/notifications?archived=true", Some(&ana)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(counts["unread"], json!(1));
    assert_eq!(inbox["notifications"].as_array().unwrap().len(), 1);
    assert_eq!(shelf["notifications"][0]["id"], json!(read));
}

#[tokio::test]
async fn archiving_cannot_reach_another_readers_row() {
    let t = test_app();
    let (ana_id, ana) = member(&t, "archive-own-ana");
    let (_bo_id, bo) = member(&t, "archive-own-bo");
    notify_user(&t, &ana_id, "Dune");
    let id = first_id(&t, &ana).await;

    post(
        &t,
        "/api/notifications/archive",
        &bo,
        json!({ "ids": [id] }),
    )
    .await;

    let (_, inbox) = get(&t.app, "/api/notifications", Some(&ana)).await;
    assert_eq!(inbox["notifications"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn pressing_an_action_is_recorded_without_touching_the_counts() {
    let t = test_app();
    let (ana_id, ana) = member(&t, "acted-ana");
    notify_user(&t, &ana_id, "Dune");
    let id = first_id(&t, &ana).await;

    let (status, _) = post(
        &t,
        &format!("/api/notifications/{id}/interacted"),
        &ana,
        json!({}),
    )
    .await;

    let (_, inbox) = get(&t.app, "/api/notifications", Some(&ana)).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(inbox["unread"], json!(1));
}

#[tokio::test]
async fn the_inbox_transitions_require_a_session() {
    let t = test_app();

    let (seen, _) = send(
        &t.app,
        "POST",
        "/api/notifications/seen",
        None,
        Some(json!({})),
    )
    .await;
    let (archive, _) = send(
        &t.app,
        "POST",
        "/api/notifications/archive",
        None,
        Some(json!({ "ids": [] })),
    )
    .await;

    assert_eq!(seen, StatusCode::UNAUTHORIZED);
    assert_eq!(archive, StatusCode::UNAUTHORIZED);
}
