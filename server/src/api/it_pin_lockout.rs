//! Integration tests for the PIN throttle (`src/api/pin.rs`): what a run of
//! wrong guesses costs at both gates, and what a later process reads.

use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{seed_access_token, seed_session, send, test_app, TestApp};
use crate::model::Permission;

const PIN: &str = "1234";
const WRONG: &str = "0000";

async fn member(t: &TestApp, tag: &str) -> (String, String) {
    let (uid, token) = seed_session(
        &t.state,
        &format!("{tag}@test.dev"),
        tag,
        &[Permission::Playback],
    );
    send(
        &t.app,
        "PATCH",
        "/api/auth/me/pin",
        Some(&token),
        Some(json!({ "pin": PIN })),
    )
    .await;
    (uid, token)
}

async fn verify(t: &TestApp, token: &str, pin: &str) -> (StatusCode, Value) {
    send(
        &t.app,
        "POST",
        "/api/auth/pin/verify",
        Some(token),
        Some(json!({ "pin": pin })),
    )
    .await
}

async fn exchange(t: &TestApp, access: &str, pin: &str) -> (StatusCode, Value) {
    send(
        &t.app,
        "POST",
        "/api/auth/token",
        None,
        Some(json!({ "accessToken": access, "pin": pin })),
    )
    .await
}

fn sql(t: &TestApp, script: &str) {
    t.state
        .db
        .get()
        .expect("a connection")
        .execute_batch(script)
        .expect("reshape the schema");
}

// The record a process that has since exited would have left behind: this one
// has counted no guesses at all.
fn lockout_on_record(t: &TestApp, uid: &str, fails: i64, secs: i64) {
    let until = time::OffsetDateTime::now_utc().unix_timestamp() + secs;
    t.state
        .db
        .get()
        .expect("a connection")
        .execute(
            "INSERT INTO pin_attempts (user_id, fails, locked_until) VALUES (?1, ?2, ?3)",
            rusqlite::params![uid, fails, until],
        )
        .expect("leave a lockout on record");
}

#[tokio::test]
async fn five_wrong_guesses_lock_the_profile_out_of_both_gates() {
    let t = test_app();
    let (uid, token) = member(&t, "pinlock").await;
    let access = seed_access_token(&t.state, &uid, false);

    for _ in 0..4 {
        let (status, _) = verify(&t, &token, WRONG).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }
    let (fifth, body) = verify(&t, &token, WRONG).await;

    assert_eq!(fifth, StatusCode::TOO_MANY_REQUESTS);
    assert!(body["retryAfter"].as_i64().unwrap_or(0) > 0, "{body}");
    assert_eq!(
        verify(&t, &token, PIN).await.0,
        StatusCode::TOO_MANY_REQUESTS,
        "the correct PIN waits out the cooldown like any other"
    );
    assert_eq!(
        exchange(&t, &access, PIN).await.0,
        StatusCode::TOO_MANY_REQUESTS,
        "the cooldown is the account's, not the gate's"
    );
}

#[tokio::test]
async fn wrong_guesses_at_the_profile_switch_count_towards_the_same_cooldown() {
    let t = test_app();
    let (uid, token) = member(&t, "switchlock").await;
    let access = seed_access_token(&t.state, &uid, false);

    for _ in 0..4 {
        let (status, _) = exchange(&t, &access, WRONG).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }
    let (fifth, body) = exchange(&t, &access, WRONG).await;

    assert_eq!(fifth, StatusCode::TOO_MANY_REQUESTS);
    assert!(body["retryAfter"].as_i64().unwrap_or(0) > 0, "{body}");
    assert_eq!(
        verify(&t, &token, PIN).await.0,
        StatusCode::TOO_MANY_REQUESTS
    );
}

#[tokio::test]
async fn the_guesses_behind_a_cooldown_are_on_record_rather_than_in_memory() {
    let t = test_app();
    let (uid, token) = member(&t, "pinrecorded").await;

    for _ in 0..5 {
        verify(&t, &token, WRONG).await;
    }

    let recorded = crate::db::pin_attempts(&t.state.db, &uid).expect("the record");
    assert_eq!(recorded.fails, 5);
    assert!(
        recorded.locked_until > time::OffsetDateTime::now_utc().unix_timestamp(),
        "{recorded:?}"
    );
}

#[tokio::test]
async fn a_cooldown_on_record_refuses_the_next_guess_whatever_this_process_counted() {
    let t = test_app();
    let (uid, token) = member(&t, "pinrestart").await;
    let access = seed_access_token(&t.state, &uid, false);
    lockout_on_record(&t, &uid, 5, 30);

    let (verified, body) = verify(&t, &token, PIN).await;
    let (exchanged, _) = exchange(&t, &access, PIN).await;

    assert_eq!(verified, StatusCode::TOO_MANY_REQUESTS);
    assert!(body["retryAfter"].as_i64().unwrap_or(0) > 0, "{body}");
    assert_eq!(exchanged, StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn a_cooldown_that_has_run_out_lets_the_correct_pin_through_and_clears_the_record() {
    let t = test_app();
    let (uid, token) = member(&t, "pinexpired").await;
    lockout_on_record(&t, &uid, 5, -1);

    let (status, _) = verify(&t, &token, PIN).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(
        crate::db::pin_attempts(&t.state.db, &uid).expect("the record"),
        crate::db::PinAttempts::default(),
        "a correct PIN leaves nothing for the next process to read"
    );
}

#[tokio::test]
async fn a_silent_refresh_asks_for_the_pin_without_spending_a_guess() {
    let t = test_app();
    let (uid, _token) = member(&t, "switcher").await;
    let access = seed_access_token(&t.state, &uid, false);

    for _ in 0..6 {
        let (status, body) = send(
            &t.app,
            "POST",
            "/api/auth/token",
            None,
            Some(json!({ "accessToken": access })),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["pinRequired"], json!(true));
    }

    let (status, body) = exchange(&t, &access, PIN).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["user"]["id"], json!(uid));
    assert_eq!(
        crate::db::pin_attempts(&t.state.db, &uid).expect("the record"),
        crate::db::PinAttempts::default()
    );

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/token",
        None,
        Some(json!({ "accessToken": access })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "the device stays verified until it is relocked"
    );
}

#[tokio::test]
async fn a_gate_that_cannot_reach_the_record_refuses_rather_than_guessing() {
    let t = test_app();
    let (_uid, token) = member(&t, "pinsealed").await;
    sql(
        &t,
        "CREATE TRIGGER no_counts BEFORE INSERT ON pin_attempts \
         BEGIN SELECT RAISE(ABORT,'sealed'); END",
    );

    let (uncounted, _) = verify(&t, &token, WRONG).await;

    sql(&t, "DROP TABLE pin_attempts");
    let (unread, _) = verify(&t, &token, PIN).await;

    assert_eq!(uncounted, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(unread, StatusCode::INTERNAL_SERVER_ERROR);
}
