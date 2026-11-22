//! Integration tests for what the server says to the mail relay, against a
//! stub relay on a local port: registration, the relay's refusal while nobody
//! has activated this server, and the question the server then writes to its
//! owner; then, once active, the members' mail going straight through.

use std::sync::atomic::Ordering;

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{
    relay_app, relay_paths, seed_session, send, stub_relay, test_app_with_mail_relay,
};
use crate::model::Permission;

#[tokio::test]
async fn the_relay_probe_registers_then_asks_the_owner_to_activate_the_server() {
    let stub = stub_relay();
    let t = relay_app(&stub);

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/admin/settings/relay-test",
        Some(&t.token),
        None,
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["sentTo"], json!("owner@test.dev"));
    assert_eq!(body["asked"], json!(true));
    assert_eq!(
        relay_paths(&stub),
        ["/v1/register", "/v1/send", "/v1/activate", "/v1/send"]
    );
    let calls = stub.calls.lock().unwrap();
    let question = &calls[3].1;
    assert_eq!(question["to"], json!("owner@test.dev"));
    assert!(question["subject"]
        .as_str()
        .unwrap()
        .contains("Home Cinema"));
    assert!(question["text"]
        .as_str()
        .unwrap()
        .contains("/confirm/v1.question"));
    assert!(!question["text"].as_str().unwrap().contains("kroma.test"));
    assert_eq!(question["attachments"][0]["contentId"], json!("logo"));
    assert!(!t
        .state
        .settings
        .get_str("mailRelay.instance", "")
        .is_empty());
}

#[tokio::test]
async fn the_relay_probe_delivers_once_the_server_is_active() {
    let stub = stub_relay();
    stub.active.store(true, Ordering::SeqCst);
    let t = relay_app(&stub);

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/admin/settings/relay-test",
        Some(&t.token),
        None,
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert!(body.get("asked").is_none());
    assert_eq!(relay_paths(&stub), ["/v1/register", "/v1/send"]);
}

#[tokio::test]
async fn a_members_mail_waits_for_the_owner_to_activate_the_server_and_then_goes_straight_through() {
    let stub = stub_relay();
    let t = relay_app(&stub);
    let (uid, _) = seed_session(&t.state, "pat@test.dev", "pat", &[Permission::Playback]);

    let (_, reset) = send(
        &t.app,
        "POST",
        &format!("/api/admin/users/{uid}/reset"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(reset["delivered"], json!("inactive"));
    assert!(reset["url"].as_str().unwrap().contains("/reset?token="));

    let (_, verification) = send(
        &t.app,
        "POST",
        &format!("/api/admin/users/{uid}/email-verification"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(verification["delivered"], json!("inactive"));
    assert_eq!(relay_paths(&stub), ["/v1/register", "/v1/send", "/v1/send"]);

    stub.active.store(true, Ordering::SeqCst);
    let (_, reset) = send(
        &t.app,
        "POST",
        &format!("/api/admin/users/{uid}/reset"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(reset["delivered"], json!("relay"));
    let (_, verification) = send(
        &t.app,
        "POST",
        &format!("/api/admin/users/{uid}/email-verification"),
        Some(&t.token),
        None,
    )
    .await;
    assert_eq!(verification["delivered"], json!("relay"));
    let calls = stub.calls.lock().unwrap();
    let message = &calls[calls.len() - 2].1;
    assert_eq!(message["to"], json!("pat@test.dev"));
    assert!(message["html"]
        .as_str()
        .unwrap()
        .contains("https://kroma.test/reset?token="));
    let message = &calls.last().unwrap().1;
    assert!(message["html"]
        .as_str()
        .unwrap()
        .contains("https://kroma.test/verify-email?token="));
    assert!(!message["html"].as_str().unwrap().contains("/confirm/"));
}

#[tokio::test]
async fn the_relay_probe_reports_a_relay_that_is_not_there_in_the_owners_words() {
    let t = test_app_with_mail_relay("http://127.0.0.1:1");
    t.state.settings.set_patch(
        &t.state.db,
        [
            ("emailDelivery".to_string(), json!("relay")),
            ("remoteUrl".to_string(), json!("https://kroma.test")),
        ]
        .into_iter()
        .collect(),
    );

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/admin/settings/relay-test",
        Some(&t.token),
        None,
    )
    .await;

    assert_eq!(status, StatusCode::BAD_GATEWAY);
    let reason = body["error"].as_str().unwrap_or_default();
    assert!(reason.contains("unreachable"), "{reason}");
    assert!(!reason.starts_with("admin."), "{reason}");
}
