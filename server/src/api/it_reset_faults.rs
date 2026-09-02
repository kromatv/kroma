//! The credential-reset and verification handlers under a broken store: every
//! arm that answers a database failure rather than unwrapping it. The schema is
//! reshaped out from under a live app, the way `it_accounts_faults` does it.

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{get, seed_session, seed_session_pw, send, test_app, TestApp};
use crate::db;
use crate::model::Permission;
use crate::services::auth;

const FUTURE: i64 = 9_999_999_999;

fn sql(t: &TestApp, script: &str) {
    t.state
        .db
        .get()
        .expect("a connection")
        .execute_batch(script)
        .expect("reshape the schema");
}

fn mint(t: &TestApp, token: &str, user_id: &str, code: &str) {
    db::create_reset(
        &t.state.db,
        token,
        user_id,
        &auth::hash_password(code),
        user_id,
        FUTURE,
    )
    .expect("mint a reset");
}

async fn redeem(t: &TestApp, token: &str, code: &str) -> StatusCode {
    send(
        &t.app,
        "POST",
        "/api/auth/reset",
        None,
        Some(json!({ "token": token, "code": code, "password": "a-new-password" })),
    )
    .await
    .0
}

#[tokio::test]
async fn the_check_refuses_when_the_resets_cannot_be_read() {
    let t = test_app();
    sql(&t, "DROP TABLE credential_resets");

    let (status, _) = get(&t.app, "/api/auth/reset/whatever", None).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn a_good_link_whose_account_cannot_be_read_greets_nobody() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "abe@test.dev", "abe", &[Permission::Playback]);
    mint(&t, "tok", &uid, "CODE1234");
    sql(&t, "ALTER TABLE users RENAME COLUMN username TO username_gone");

    let (status, body) = get(&t.app, "/api/auth/reset/tok", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["valid"], json!(true));
    assert_eq!(body["username"], json!(null));
}

#[tokio::test]
async fn a_redeem_refuses_when_the_resets_cannot_be_read() {
    let t = test_app();
    sql(&t, "DROP TABLE credential_resets");

    assert_eq!(
        redeem(&t, "whatever", "CODE1234").await,
        StatusCode::INTERNAL_SERVER_ERROR
    );
}

#[tokio::test]
async fn a_link_that_vanishes_between_the_code_and_the_consume_is_refused() {
    let t = test_app();
    let (uid, _) = seed_session_pw(
        &t.state,
        "bea@test.dev",
        "bea",
        "old-password",
        &[Permission::Playback],
    );
    mint(&t, "tok", &uid, "CODE1234");
    sql(
        &t,
        "CREATE TRIGGER reset_vanishes BEFORE UPDATE OF used_at ON credential_resets BEGIN \
           DELETE FROM credential_resets WHERE token = OLD.token; \
         END",
    );

    assert_eq!(redeem(&t, "tok", "CODE1234").await, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_consume_that_fails_outright_refuses_rather_than_half_resetting() {
    let t = test_app();
    let (uid, _) = seed_session_pw(
        &t.state,
        "cyd@test.dev",
        "cyd",
        "old-password",
        &[Permission::Playback],
    );
    mint(&t, "tok", &uid, "CODE1234");
    sql(
        &t,
        "CREATE TRIGGER reset_refuses BEFORE UPDATE OF used_at ON credential_resets BEGIN \
           SELECT RAISE(FAIL,'no'); \
         END",
    );

    assert_eq!(
        redeem(&t, "tok", "CODE1234").await,
        StatusCode::INTERNAL_SERVER_ERROR
    );
}

#[tokio::test]
async fn a_password_the_store_will_not_take_refuses_rather_than_reporting_success() {
    let t = test_app();
    let (uid, _) = seed_session_pw(
        &t.state,
        "dot@test.dev",
        "dot",
        "old-password",
        &[Permission::Playback],
    );
    mint(&t, "tok", &uid, "CODE1234");
    sql(
        &t,
        "CREATE TRIGGER password_refuses BEFORE UPDATE OF password_hash ON users BEGIN \
           SELECT RAISE(FAIL,'no'); \
         END",
    );

    assert_eq!(
        redeem(&t, "tok", "CODE1234").await,
        StatusCode::INTERNAL_SERVER_ERROR
    );
}

#[tokio::test]
async fn the_verification_handlers_refuse_when_their_table_is_gone() {
    let t = test_app();
    sql(&t, "DROP TABLE email_verifications");

    let (status, _) = get(&t.app, "/api/auth/verify-email/whatever", None).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/verify-email",
        None,
        Some(json!({ "token": "whatever" })),
    )
    .await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}
