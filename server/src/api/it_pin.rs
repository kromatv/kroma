//! Integration tests for the profile-PIN handlers (`src/api/pin.rs`): set /
//! rotate / clear (with the current-PIN guard), verify, and the brute-force
//! lockout. All DB-only; the lockout static is keyed by the (unique) user id so
//! these can't contaminate one another.

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{seed_access_token, seed_session, send, test_app};
use crate::model::Permission;

#[tokio::test]
async fn pin_set_verify_and_clear_flow() {
    let t = test_app();
    let (_uid, token) = seed_session(&t.state, "pin@test.dev", "pinner", &[Permission::Playback]);

    // A non-4-digit PIN is rejected.
    let (status, _) = send(
        &t.app,
        "PATCH",
        "/api/auth/me/pin",
        Some(&token),
        Some(json!({ "pin": "12" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Setting a fresh PIN needs no `current`.
    let (status, body) = send(
        &t.app,
        "PATCH",
        "/api/auth/me/pin",
        Some(&token),
        Some(json!({ "pin": "1234" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["user"]["hasPin"], json!(true));

    // Verify: correct -> 204, wrong -> 401.
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/pin/verify",
        Some(&token),
        Some(json!({ "pin": "1234" })),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/pin/verify",
        Some(&token),
        Some(json!({ "pin": "0000" })),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Rotating a set PIN without the current one is rejected.
    let (status, _) = send(
        &t.app,
        "PATCH",
        "/api/auth/me/pin",
        Some(&token),
        Some(json!({ "pin": "5678" })),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    // With the correct current it rotates.
    let (status, _) = send(
        &t.app,
        "PATCH",
        "/api/auth/me/pin",
        Some(&token),
        Some(json!({ "pin": "5678", "current": "1234" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // Clearing needs the current PIN; then hasPin flips off.
    let (status, body) = send(
        &t.app,
        "DELETE",
        "/api/auth/me/pin",
        Some(&token),
        Some(json!({ "current": "5678" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["user"]["hasPin"], json!(false));

    // With no PIN set, verify is a permissive 204 (nothing to gate).
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/pin/verify",
        Some(&token),
        Some(json!({ "pin": "9999" })),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn pin_verify_locks_out_after_five_wrong_tries() {
    let t = test_app();
    let (_uid, token) = seed_session(
        &t.state,
        "pinlock@test.dev",
        "pinlock",
        &[Permission::Playback],
    );
    send(
        &t.app,
        "PATCH",
        "/api/auth/me/pin",
        Some(&token),
        Some(json!({ "pin": "1234" })),
    )
    .await;

    // Four wrong tries are plain 401s.
    for _ in 0..4 {
        let (status, _) = send(
            &t.app,
            "POST",
            "/api/auth/pin/verify",
            Some(&token),
            Some(json!({ "pin": "0000" })),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }
    // The fifth trips the fixed cooldown -> 429 with a retryAfter.
    let (status, body) = send(
        &t.app,
        "POST",
        "/api/auth/pin/verify",
        Some(&token),
        Some(json!({ "pin": "0000" })),
    )
    .await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
    assert!(body["retryAfter"].as_i64().unwrap_or(0) > 0);

    // While locked, even the correct PIN is refused with 429.
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/pin/verify",
        Some(&token),
        Some(json!({ "pin": "1234" })),
    )
    .await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn switching_into_a_locked_profile_asks_for_the_pin_without_spending_a_try() {
    let t = test_app();
    let (uid, token) = seed_session(
        &t.state,
        "switch@test.dev",
        "switcher",
        &[Permission::Playback],
    );
    send(
        &t.app,
        "PATCH",
        "/api/auth/me/pin",
        Some(&token),
        Some(json!({ "pin": "1234" })),
    )
    .await;
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

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/auth/token",
        None,
        Some(json!({ "accessToken": access, "pin": "1234" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["token"].as_str().is_some_and(|s| !s.is_empty()));
    assert_eq!(body["user"]["id"], json!(uid));

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/token",
        None,
        Some(json!({ "accessToken": access })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn wrong_pins_at_the_profile_switch_lock_the_profile_out_too() {
    let t = test_app();
    let (uid, token) = seed_session(
        &t.state,
        "switchlock@test.dev",
        "switchlock",
        &[Permission::Playback],
    );
    send(
        &t.app,
        "PATCH",
        "/api/auth/me/pin",
        Some(&token),
        Some(json!({ "pin": "1234" })),
    )
    .await;
    let access = seed_access_token(&t.state, &uid, false);

    for _ in 0..4 {
        let (status, _) = send(
            &t.app,
            "POST",
            "/api/auth/token",
            None,
            Some(json!({ "accessToken": access, "pin": "0000" })),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }
    let (status, body) = send(
        &t.app,
        "POST",
        "/api/auth/token",
        None,
        Some(json!({ "accessToken": access, "pin": "0000" })),
    )
    .await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
    assert!(body["retryAfter"].as_i64().unwrap_or(0) > 0);

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/token",
        None,
        Some(json!({ "accessToken": access, "pin": "1234" })),
    )
    .await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/auth/pin/verify",
        Some(&token),
        Some(json!({ "pin": "1234" })),
    )
    .await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn clearing_a_pin_needs_the_current_one_and_is_a_no_op_without_any() {
    let t = test_app();
    let (_uid, token) = seed_session(
        &t.state,
        "clear@test.dev",
        "clearer",
        &[Permission::Playback],
    );

    let (status, body) = send(
        &t.app,
        "DELETE",
        "/api/auth/me/pin",
        Some(&token),
        Some(json!({ "current": "0000" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["user"]["hasPin"], json!(false));

    send(
        &t.app,
        "PATCH",
        "/api/auth/me/pin",
        Some(&token),
        Some(json!({ "pin": "1234" })),
    )
    .await;
    let (status, _) = send(
        &t.app,
        "DELETE",
        "/api/auth/me/pin",
        Some(&token),
        Some(json!({ "current": "0000" })),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn every_pin_handler_refuses_when_the_stored_pin_is_unreadable() {
    let t = test_app();
    let (uid, token) = seed_session(
        &t.state,
        "broken@test.dev",
        "broken",
        &[Permission::Playback],
    );
    t.state
        .db
        .get()
        .expect("a connection")
        .execute(
            "UPDATE users SET pin_hash = X'00ff' WHERE id = ?1",
            rusqlite::params![uid],
        )
        .expect("corrupt the stored pin");

    for (method, body) in [
        ("POST", json!({ "pin": "1234" })),
        ("PATCH", json!({ "pin": "1234" })),
        ("DELETE", json!({ "current": "1234" })),
    ] {
        let uri = if method == "POST" {
            "/api/auth/pin/verify"
        } else {
            "/api/auth/me/pin"
        };
        let (status, _) = send(&t.app, method, uri, Some(&token), Some(body)).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR, "{method} {uri}");
    }
}

#[tokio::test]
async fn a_pin_that_cannot_be_written_is_refused_rather_than_reported_set() {
    let t = test_app();
    let (_uid, token) = seed_session(
        &t.state,
        "sealed@test.dev",
        "sealed",
        &[Permission::Playback],
    );
    send(
        &t.app,
        "PATCH",
        "/api/auth/me/pin",
        Some(&token),
        Some(json!({ "pin": "1234" })),
    )
    .await;
    t.state
        .db
        .get()
        .expect("a connection")
        .execute_batch(
            "CREATE TRIGGER no_pin_writes BEFORE UPDATE OF pin_hash ON users \
             BEGIN SELECT RAISE(ABORT,'sealed'); END",
        )
        .expect("seal the column");

    let (status, _) = send(
        &t.app,
        "PATCH",
        "/api/auth/me/pin",
        Some(&token),
        Some(json!({ "pin": "5678", "current": "1234" })),
    )
    .await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);

    let (status, _) = send(
        &t.app,
        "DELETE",
        "/api/auth/me/pin",
        Some(&token),
        Some(json!({ "current": "1234" })),
    )
    .await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn a_dead_access_token_says_so_rather_than_asking_for_a_pin() {
    let t = test_app();
    for body in [
        json!({ "accessToken": "" }),
        json!({ "accessToken": "   " }),
        json!({ "accessToken": "no-such-token" }),
    ] {
        let (status, out) = send(&t.app, "POST", "/api/auth/token", None, Some(body.clone())).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED, "{body}");
        assert_eq!(out["tokenInvalid"], json!(true), "{body}");
    }
}
