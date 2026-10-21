use serde_json::json;

use crate::api::test_support::{seed_session_pw, send, test_app};
use crate::model::Permission;

#[tokio::test]
async fn registration_without_an_invite_does_not_say_whether_an_email_exists() {
    let t = test_app();
    seed_session_pw(
        &t.state,
        "taken@test.dev",
        "taken",
        "right-password",
        &[Permission::Playback],
    );

    let (taken, _) = send(
        &t.app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": "taken@test.dev", "username": "fresh", "password": "s3cret12" })),
    )
    .await;
    let (free, _) = send(
        &t.app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": "free@test.dev", "username": "fresh", "password": "s3cret12" })),
    )
    .await;

    assert_eq!(taken, free);
}

#[tokio::test]
async fn an_email_cannot_be_set_to_another_users_username() {
    let t = test_app();
    seed_session_pw(
        &t.state,
        "bob@test.dev",
        "bob@home",
        "right-password",
        &[Permission::Playback],
    );
    let (_, member) = seed_session_pw(
        &t.state,
        "eve@test.dev",
        "eve",
        "right-password",
        &[Permission::Playback],
    );

    let (status, _) = send(
        &t.app,
        "PATCH",
        "/api/auth/me",
        Some(&member),
        Some(json!({ "email": "bob@home" })),
    )
    .await;

    assert_eq!(status, axum::http::StatusCode::CONFLICT);
}
