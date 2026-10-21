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
