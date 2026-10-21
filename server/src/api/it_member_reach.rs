use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{
    household_where_the_viewer_only_sees_films, raw, send, test_app,
};
use crate::model::Permission;

#[tokio::test]
async fn a_member_cannot_read_the_server_log() {
    let t = test_app();
    let (_, member) = crate::api::test_support::seed_session(
        &t.state,
        "member@test.dev",
        "member",
        &[Permission::Playback],
    );

    let (status, _, _) = raw(&t.app, "GET", "/api/logs", Some(&member), None, &[]).await;

    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn a_member_cannot_start_a_library_scan() {
    let t = test_app();
    let (_, member) = crate::api::test_support::seed_session(
        &t.state,
        "member@test.dev",
        "member",
        &[Permission::Playback],
    );

    let (status, _) = send(&t.app, "POST", "/api/scan", Some(&member), None).await;

    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn a_report_on_a_hidden_title_answers_like_an_unknown_one() {
    let h = household_where_the_viewer_only_sees_films();

    let (status, body) = send(
        &h.app.app,
        "POST",
        "/api/reports",
        Some(&h.viewer),
        Some(json!({
            "subjectKind": "episode",
            "subjectId": h.episode,
            "category": "other",
        })),
    )
    .await;

    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}
