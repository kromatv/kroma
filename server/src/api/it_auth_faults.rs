use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{get, raw, seed_access_token, send, test_app, TestApp};
use crate::model::Permission;

const FUTURE: i64 = 9_999_999_999;

const HIDE_PASSWORD_HASH: &str =
    "ALTER TABLE users RENAME COLUMN password_hash TO password_hash_gone";

const SEAL_SESSIONS: &str =
    "CREATE TRIGGER no_new_sessions BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'sealed'); END";

fn sql(t: &TestApp, script: &str) {
    t.state
        .db
        .get()
        .expect("a connection")
        .execute_batch(script)
        .expect("reshape the schema");
}

fn invite(t: &TestApp, token: &str) {
    crate::db::create_invite(
        &t.state.db,
        token,
        &[Permission::Playback],
        &t.user_id,
        FUTURE,
    )
    .expect("mint an invite");
}

async fn register(t: &TestApp, email: &str, token: Option<&str>) -> StatusCode {
    let mut body = json!({ "email": email, "username": "newcomer", "password": "hunter2!" });
    if let Some(token) = token {
        body["inviteToken"] = json!(token);
    }
    send(&t.app, "POST", "/api/auth/register", None, Some(body))
        .await
        .0
}

#[tokio::test]
async fn registration_refuses_when_the_accounts_are_uncountable() {
    let t = test_app();
    sql(&t, "DROP TABLE users");

    assert_eq!(
        register(&t, "new@test.dev", None).await,
        StatusCode::INTERNAL_SERVER_ERROR
    );
}

#[tokio::test]
async fn registration_refuses_when_the_duplicate_check_cannot_read_the_account() {
    let t = test_app();
    sql(&t, HIDE_PASSWORD_HASH);

    assert_eq!(
        register(&t, "new@test.dev", None).await,
        StatusCode::INTERNAL_SERVER_ERROR
    );
}

#[tokio::test]
async fn registration_refuses_when_the_invite_cannot_be_consumed() {
    let t = test_app();
    invite(&t, "invite-eaten");
    sql(&t, "DROP TABLE invites");

    let status = register(&t, "new@test.dev", Some("invite-eaten")).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn registration_refuses_when_the_account_cannot_be_written() {
    let t = test_app();
    invite(&t, "invite-unwritable");
    sql(
        &t,
        "CREATE TRIGGER no_new_users BEFORE INSERT ON users BEGIN SELECT RAISE(ABORT,'sealed'); END",
    );

    let status = register(&t, "new@test.dev", Some("invite-unwritable")).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn registration_refuses_when_the_new_account_gets_no_session_to_show_for_it() {
    let t = test_app();
    invite(&t, "invite-sessionless");
    sql(&t, SEAL_SESSIONS);

    let status = register(&t, "new@test.dev", Some("invite-sessionless")).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn login_refuses_when_the_account_lookup_fails() {
    let t = test_app();
    sql(&t, HIDE_PASSWORD_HASH);

    let (status, _h, _b) = raw(
        &t.app,
        "POST",
        "/api/auth/login",
        None,
        Some(json!({ "email": "owner@test.dev", "password": "hunter2!" })),
        &[("cf-connecting-ip", "10.9.0.1")],
    )
    .await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn the_login_gate_assumes_accounts_exist_when_it_cannot_count_them() {
    let t = test_app();
    sql(&t, "DROP TABLE users");

    let (status, body) = get(&t.app, "/api/auth/config", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["hasAccounts"], json!(true));
}

#[tokio::test]
async fn exchanging_a_credential_refuses_when_it_cannot_be_read() {
    let t = test_app();
    sql(&t, "DROP TABLE access_tokens");

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/token",
        None,
        Some(json!({ "accessToken": "whatever" })),
    )
    .await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn exchanging_a_credential_refuses_when_no_session_can_be_minted() {
    let t = test_app();
    let access = seed_access_token(&t.state, &t.user_id, true);
    sql(&t, SEAL_SESSIONS);

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/token",
        None,
        Some(json!({ "accessToken": access })),
    )
    .await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn approving_a_quick_connect_code_refuses_when_the_credentials_cannot_be_minted() {
    let t = test_app();
    let (_, init) = send(
        &t.app,
        "POST",
        "/api/auth/quickconnect/initiate",
        None,
        None,
    )
    .await;
    let code = init["code"].as_str().expect("a code").to_string();
    sql(&t, "DROP TABLE access_tokens");

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/quickconnect/authorize",
        Some(&t.token),
        Some(json!({ "code": code })),
    )
    .await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}
