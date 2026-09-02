//! Integration tests for the credential-reset surface (`api/accounts/reset.rs`):
//! the sign-in screen's request, the reset page's check, and the redeem that
//! ends every session for the account.

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{
    get, raw, seed_session, seed_session_pw, send, test_app, TestApp,
};
use crate::db;
use crate::model::Permission;
use crate::services::auth;

const FUTURE: i64 = 9_999_999_999;
const PAST: i64 = 1;

fn mint(t: &TestApp, token: &str, user_id: &str, code: &str, expires_at: i64) {
    db::create_reset(
        &t.state.db,
        token,
        user_id,
        &auth::hash_password(code),
        user_id,
        expires_at,
    )
    .expect("mint a reset");
}

fn sql(t: &TestApp, script: &str) {
    t.state
        .db
        .get()
        .expect("a connection")
        .execute_batch(script)
        .expect("reshape the schema");
}

// The request throttle is process-wide, so every test claims its own source.
async fn request(t: &TestApp, ip: &str, identifier: &str) -> StatusCode {
    let (status, _h, _b) = raw(
        &t.app,
        "POST",
        "/api/auth/reset-request",
        None,
        Some(json!({ "identifier": identifier })),
        &[("cf-connecting-ip", ip)],
    )
    .await;
    status
}

async fn redeem(t: &TestApp, token: &str, code: &str, password: &str) -> (StatusCode, String) {
    let (status, body) = send(
        &t.app,
        "POST",
        "/api/auth/reset",
        None,
        Some(json!({ "token": token, "code": code, "password": password })),
    )
    .await;
    (status, body["error"].as_str().unwrap_or_default().to_string())
}

#[tokio::test]
async fn a_request_answers_the_same_whether_or_not_the_account_exists() {
    let t = test_app();
    seed_session(&t.state, "gwen@test.dev", "gwen", &[Permission::Playback]);

    assert_eq!(
        request(&t, "10.1.0.1", "gwen@test.dev").await,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        request(&t, "10.1.0.2", "ghost@test.dev").await,
        StatusCode::NO_CONTENT
    );
    assert_eq!(request(&t, "10.1.0.3", "   ").await, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn a_matching_request_marks_the_member_until_the_owner_mints() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "may@test.dev", "may", &[Permission::Playback]);

    request(&t, "10.1.1.1", "may").await;
    let (status, body) = get(&t.app, "/api/admin/users", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    let marked = |b: &serde_json::Value| {
        b["users"]
            .as_array()
            .expect("the member list")
            .iter()
            .find(|u| u["id"] == json!(uid))
            .expect("the member")["resetRequested"]
            == json!(true)
    };
    assert!(marked(&body));

    mint(&t, "minted", &uid, "CODE1234", FUTURE);
    let (_, body) = get(&t.app, "/api/admin/users", Some(&t.token)).await;
    assert!(!marked(&body));
}

#[tokio::test]
async fn a_source_that_keeps_asking_is_throttled() {
    let t = test_app();

    for _ in 0..5 {
        assert_eq!(
            request(&t, "10.1.2.1", "ghost@test.dev").await,
            StatusCode::NO_CONTENT
        );
    }
    assert_eq!(
        request(&t, "10.1.2.1", "ghost@test.dev").await,
        StatusCode::TOO_MANY_REQUESTS
    );
}

#[tokio::test]
async fn the_check_greets_the_user_by_name_only_while_the_link_is_good() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "ben@test.dev", "ben", &[Permission::Playback]);
    let (other, _) = seed_session(&t.state, "cal@test.dev", "cal", &[Permission::Playback]);
    mint(&t, "good", &uid, "CODE1234", FUTURE);
    mint(&t, "stale", &other, "CODE1234", PAST);

    let (status, body) = get(&t.app, "/api/auth/reset/good", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["valid"], json!(true));
    assert_eq!(body["username"], json!("ben"));

    let (_, body) = get(&t.app, "/api/auth/reset/stale", None).await;
    assert_eq!(body["valid"], json!(false));
    assert_eq!(body["username"], json!(null));

    let (_, body) = get(&t.app, "/api/auth/reset/never-minted", None).await;
    assert_eq!(body["valid"], json!(false));
}

#[tokio::test]
async fn the_check_reports_a_locked_link_as_invalid() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "kate@test.dev", "kate", &[Permission::Playback]);
    mint(&t, "locked", &uid, "CODE1234", FUTURE);
    sql(
        &t,
        &format!(
            "UPDATE credential_resets SET attempts = {} WHERE token = 'locked'",
            db::MAX_RESET_ATTEMPTS
        ),
    );

    let (_, body) = get(&t.app, "/api/auth/reset/locked", None).await;
    assert_eq!(body["valid"], json!(false));
}

#[tokio::test]
async fn a_redeem_needs_the_code_the_owner_read_out() {
    let t = test_app();
    let (uid, _) = seed_session_pw(
        &t.state,
        "otto@test.dev",
        "otto",
        "old-password",
        &[Permission::Playback],
    );
    mint(&t, "tok", &uid, "CODE1234", FUTURE);

    let (status, error) = redeem(&t, "tok", "WRONG123", "a-new-password").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(!error.is_empty());
    assert_eq!(
        db::get_reset(&t.state.db, "tok")
            .expect("read the reset")
            .expect("the reset")
            .attempts,
        1
    );

    let (status, _) = redeem(&t, "tok", "CODE1234", "a-new-password").await;
    assert_eq!(status, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn a_completed_reset_sets_the_password_and_ends_every_session() {
    let t = test_app();
    let (uid, session) = seed_session_pw(
        &t.state,
        "nick@test.dev",
        "nick",
        "old-password",
        &[Permission::Playback],
    );
    mint(&t, "tok", &uid, "CODE1234", FUTURE);

    let (status, _) = redeem(&t, "tok", "CODE1234", "a-new-password").await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (status, _) = get(&t.app, "/api/auth/me/sessions", Some(&session)).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, _h, body) = raw(
        &t.app,
        "POST",
        "/api/auth/login",
        None,
        Some(json!({ "email": "nick@test.dev", "password": "a-new-password" })),
        &[("cf-connecting-ip", "10.1.3.1")],
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["token"].is_string());
}

#[tokio::test]
async fn a_redeem_refuses_a_short_password_an_unknown_link_and_a_stale_one() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "sam@test.dev", "sam", &[Permission::Playback]);
    mint(&t, "stale", &uid, "CODE1234", PAST);

    for (token, code, password) in [
        ("stale", "CODE1234", "short"),
        ("never-minted", "CODE1234", "a-new-password"),
        ("stale", "CODE1234", "a-new-password"),
    ] {
        let (status, error) = redeem(&t, token, code, password).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(!error.is_empty());
    }
}

#[tokio::test]
async fn a_used_link_cannot_be_redeemed_twice() {
    let t = test_app();
    let (uid, _) = seed_session_pw(
        &t.state,
        "vic@test.dev",
        "vic",
        "old-password",
        &[Permission::Playback],
    );
    mint(&t, "tok", &uid, "CODE1234", FUTURE);

    assert_eq!(
        redeem(&t, "tok", "CODE1234", "a-new-password").await.0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        redeem(&t, "tok", "CODE1234", "another-password").await.0,
        StatusCode::BAD_REQUEST
    );
}

#[tokio::test]
async fn five_wrong_codes_lock_the_link_for_good() {
    let t = test_app();
    let (uid, _) = seed_session_pw(
        &t.state,
        "lin@test.dev",
        "lin",
        "old-password",
        &[Permission::Playback],
    );
    mint(&t, "tok", &uid, "CODE1234", FUTURE);

    for _ in 0..db::MAX_RESET_ATTEMPTS {
        assert_eq!(
            redeem(&t, "tok", "WRONG123", "a-new-password").await.0,
            StatusCode::BAD_REQUEST
        );
    }

    let (status, error) = redeem(&t, "tok", "CODE1234", "a-new-password").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(!error.is_empty());
}
