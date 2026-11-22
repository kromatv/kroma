use std::sync::atomic::Ordering;

use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{
    get, mint_invitation, relay_app, relay_paths, seed_session, seed_waiting, send, stub_relay,
    test_app, TestApp,
};
use crate::db;
use crate::model::Permission;

async fn invite(t: &TestApp) -> String {
    let (status, body) = send(
        &t.app,
        "POST",
        "/api/invites",
        Some(&t.token),
        Some(json!({})),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body["token"]
        .as_str()
        .expect("an invitation token")
        .to_string()
}

async fn mail(t: &TestApp, token: &str, body: Value) -> (StatusCode, Value) {
    let uri = format!("/api/invites/{token}/mail");
    send(&t.app, "POST", &uri, Some(&t.token), Some(body)).await
}

async fn still_works(t: &TestApp, token: &str) -> bool {
    let (_, body) = get(&t.app, &format!("/api/invites/{token}"), None).await;
    body["valid"] == json!(true)
}

fn links(text: &str) -> Vec<&str> {
    text.match_indices("https://")
        .map(|(at, _)| {
            let rest = &text[at..];
            let end = rest.find(['"', '<', ' ', '\n']).unwrap_or(rest.len());
            &rest[..end]
        })
        .collect()
}

#[tokio::test]
async fn an_invitation_leaves_through_the_relay_with_a_link_to_this_server_only() {
    let stub = stub_relay();
    stub.active.store(true, Ordering::SeqCst);
    let t = relay_app(&stub);
    let token = invite(&t).await;

    let (status, body) = mail(
        &t,
        &token,
        json!({ "to": " Lea@Test.dev ", "locale": "fr" }),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["delivered"], json!("relay"));
    let calls = stub.calls.lock().unwrap();
    let message = &calls.last().unwrap().1;
    assert_eq!(message["to"], json!("lea@test.dev"));
    let subject = crate::i18n::t("fr", "email.invite.subject", &[("name", "Home Cinema")]);
    assert_eq!(message["subject"], json!(subject));
    let link = format!("https://kroma.test/join?invite={token}");
    let text = message["text"].as_str().unwrap();
    let html = message["html"].as_str().unwrap();
    assert_eq!(links(text), [link.as_str()]);
    assert_eq!(links(html), [link.as_str(), link.as_str()]);
}

#[tokio::test]
async fn an_invitation_the_relay_will_not_carry_yet_answers_inactive_and_still_works() {
    let stub = stub_relay();
    let t = relay_app(&stub);
    let token = invite(&t).await;

    let (status, body) = mail(&t, &token, json!({ "to": "lea@test.dev" })).await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["delivered"], json!("inactive"));
    assert!(still_works(&t, &token).await);
}

#[tokio::test]
async fn a_server_that_sends_no_mail_answers_manual_and_asks_nobody() {
    let stub = stub_relay();
    let t = relay_app(&stub);
    t.state.settings.set_patch(
        &t.state.db,
        [("emailDelivery".to_string(), json!("manual"))]
            .into_iter()
            .collect(),
    );
    let token = invite(&t).await;

    let (status, body) = mail(&t, &token, json!({ "to": "lea@test.dev" })).await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["delivered"], json!("manual"));
    assert!(relay_paths(&stub).is_empty());
}

#[tokio::test]
async fn a_server_with_no_public_address_answers_manual_since_no_link_could_be_written() {
    let t = test_app();
    t.state.settings.set_patch(
        &t.state.db,
        [("emailDelivery".to_string(), json!("smtp"))]
            .into_iter()
            .collect(),
    );
    let token = invite(&t).await;

    let (status, body) = mail(&t, &token, json!({ "to": "lea@test.dev" })).await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["delivered"], json!("manual"));
}

#[tokio::test]
async fn a_mail_that_cannot_leave_says_why_and_leaves_the_invitation_as_it_was() {
    let t = test_app();
    t.state.settings.set_patch(
        &t.state.db,
        [
            ("emailDelivery".to_string(), json!("smtp")),
            ("smtpHost".to_string(), json!("127.0.0.1")),
            ("smtpPort".to_string(), json!("1")),
            ("smtpFrom".to_string(), json!("kroma@test.dev")),
            ("remoteUrl".to_string(), json!("https://kroma.test")),
        ]
        .into_iter()
        .collect(),
    );
    let token = invite(&t).await;
    let before = db::get_invite(&t.state.db, &token).unwrap().unwrap();

    let (status, body) = mail(&t, &token, json!({ "to": "lea@test.dev" })).await;

    assert_eq!(status, StatusCode::BAD_GATEWAY, "{body}");
    assert!(!body["error"].as_str().unwrap_or_default().is_empty());
    let after = db::get_invite(&t.state.db, &token).unwrap().unwrap();
    assert_eq!(
        (after.used, after.expires_at),
        (before.used, before.expires_at)
    );
    assert!(still_works(&t, &token).await);
}

#[tokio::test]
async fn the_invitation_of_an_account_that_waits_is_sent_the_same_way() {
    let stub = stub_relay();
    stub.active.store(true, Ordering::SeqCst);
    let t = relay_app(&stub);
    let waiting = seed_waiting(&t.state, "lea", Some("lea@test.dev"));
    let token = mint_invitation(&t, &waiting).await;

    let (status, body) = mail(&t, &token, json!({ "to": "lea@test.dev" })).await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["delivered"], json!("relay"));
}

#[tokio::test]
async fn an_invitation_that_is_spent_expired_or_unknown_is_not_sent() {
    let stub = stub_relay();
    stub.active.store(true, Ordering::SeqCst);
    let t = relay_app(&stub);
    db::create_invite(
        &t.state.db,
        "lapsed",
        &[Permission::Playback],
        &t.user_id,
        1,
    )
    .unwrap();

    let (lapsed, _) = mail(&t, "lapsed", json!({ "to": "lea@test.dev" })).await;
    let (unknown, _) = mail(&t, "nobody", json!({ "to": "lea@test.dev" })).await;

    assert_eq!(lapsed, StatusCode::CONFLICT);
    assert_eq!(unknown, StatusCode::NOT_FOUND);
    assert!(relay_paths(&stub).is_empty());
}

#[tokio::test]
async fn an_address_that_is_not_one_is_refused_before_anything_leaves() {
    let stub = stub_relay();
    stub.active.store(true, Ordering::SeqCst);
    let t = relay_app(&stub);
    let token = invite(&t).await;

    let (no_at, _) = mail(&t, &token, json!({ "to": "lea" })).await;
    let (spaced, _) = mail(&t, &token, json!({ "to": "lea @test.dev" })).await;

    assert_eq!(no_at, StatusCode::BAD_REQUEST);
    assert_eq!(spaced, StatusCode::BAD_REQUEST);
    assert!(relay_paths(&stub).is_empty());
}

#[tokio::test]
async fn only_an_account_that_manages_users_sends_an_invitation() {
    let t = test_app();
    let token = invite(&t).await;
    let (_, member) = seed_session(&t.state, "pat@test.dev", "pat", &[Permission::Playback]);

    let uri = format!("/api/invites/{token}/mail");
    let body = json!({ "to": "lea@test.dev" });
    let (status, _) = send(&t.app, "POST", &uri, Some(&member), Some(body)).await;

    assert_eq!(status, StatusCode::FORBIDDEN);
}
