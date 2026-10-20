use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{raw, seed_session, test_app};
use crate::model::Permission;

async fn start_registration() -> (StatusCode, Value) {
    let t = test_app();
    let (_uid, token) = seed_session(
        &t.state,
        "keys@test.dev",
        "keyholder",
        &[Permission::Playback],
    );
    let (status, _, body) = raw(
        &t.app,
        "POST",
        "/api/auth/me/passkeys/register/start",
        Some(&token),
        None,
        &[("origin", "https://kroma.example")],
    )
    .await;
    (status, body["options"]["publicKey"].clone())
}

#[tokio::test]
async fn registration_requires_a_credential_the_usernameless_sign_in_can_find() {
    let (status, options) = start_registration().await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        options["authenticatorSelection"]["residentKey"],
        json!("required")
    );
    assert_eq!(
        options["authenticatorSelection"]["requireResidentKey"],
        json!(true)
    );
}

#[tokio::test]
async fn registration_accepts_a_passkey_from_any_manager() {
    let (status, options) = start_registration().await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(options["attestation"], json!("none"));
    assert_eq!(
        options["authenticatorSelection"].get("authenticatorAttachment"),
        None
    );
    assert_eq!(options.get("hints"), None);
}
