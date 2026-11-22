use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::api::test_support::{
    IMPORTER, TestApp, importer_answering, on_disk, seed_session, send,
};

const PIN: &str = "4821";

fn unlock_url() -> String {
    format!("/api/admin/importers/{IMPORTER}/unlock")
}

fn for_cleo(pin: &str) -> Value {
    json!({ "signIn": "s-1", "server": "srv", "user": "44", "pin": pin })
}

async fn unlock(t: &TestApp, body: Value) -> (StatusCode, Value) {
    send(&t.app, "POST", &unlock_url(), Some(&t.token), Some(body)).await
}

#[tokio::test]
async fn unlock_passes_the_pin_to_the_importer_once_and_answers_that_the_user_is_unlocked() {
    let (t, sent) = importer_answering(json!({ "Ok": { "status": "unlocked" } }));

    let (status, body) = unlock(&t, for_cleo(PIN)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({ "status": "unlocked" }));
    assert_eq!(
        *sent.lock().unwrap(),
        vec![("unlock".to_string(), for_cleo(PIN))]
    );
}

#[tokio::test]
async fn a_wrong_pin_is_an_answer_the_screen_can_show() {
    let (t, _) = importer_answering(json!({ "Ok": { "status": "refused", "reason": "pin" } }));

    let (status, body) = unlock(&t, for_cleo("0000")).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({ "status": "refused", "reason": "pin" }));
}

#[tokio::test]
async fn the_core_keeps_no_pin_and_says_none_back() {
    let (t, _) = importer_answering(json!({ "Err": format!("plex.tv did not take {PIN}") }));

    let (status, body) = unlock(&t, for_cleo(PIN)).await;

    assert_eq!(status, StatusCode::BAD_GATEWAY);
    assert_eq!(body, json!({ "error": "plex.tv did not take ****" }));
    assert!(on_disk(&t, "owner@test.dev"));
    assert!(!on_disk(&t, PIN));
}

#[tokio::test]
async fn unlocking_is_for_whoever_manages_settings() {
    let (t, sent) = importer_answering(json!({ "Ok": { "status": "unlocked" } }));
    let (_, member) = seed_session(&t.state, "ana@test.dev", "ana", &[]);

    let (as_member, _) = send(
        &t.app,
        "POST",
        &unlock_url(),
        Some(&member),
        Some(for_cleo(PIN)),
    )
    .await;
    let (anonymous, _) = send(&t.app, "POST", &unlock_url(), None, Some(for_cleo(PIN))).await;

    assert_eq!(as_member, StatusCode::FORBIDDEN);
    assert_eq!(anonymous, StatusCode::UNAUTHORIZED);
    assert!(sent.lock().unwrap().is_empty());
}
