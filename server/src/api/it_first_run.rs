//! Integration tests for first run (`src/api/accounts/credentials.rs`): the one
//! account an empty server grants the whole machine to, and the invite every
//! account after it needs.

use std::sync::Arc;

use axum::http::StatusCode;
use axum::Router;
use serde_json::json;
use tokio::sync::Barrier;

use crate::api::test_support::{send, test_app, TestApp};
use crate::model::Permission;

// A fresh server: no accounts at all. `test_app` seeds an owner, so the very
// first-registration path is otherwise unreachable.
fn empty_of_accounts(t: &TestApp) {
    t.state
        .db
        .get()
        .unwrap()
        .execute("DELETE FROM users", [])
        .unwrap();
}

async fn register(app: &Router, email: &str, username: &str) -> (StatusCode, serde_json::Value) {
    send(
        app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": email, "username": username, "password": "s3cret12" })),
    )
    .await
}

#[tokio::test]
async fn the_first_account_on_a_fresh_server_is_the_owner() {
    // Nobody can mint an invite before the first account exists, so if this
    // path required one a fresh install would be permanently unusable - and if
    // it granted the default permissions instead, the owner could not reach the
    // admin console to grant themselves any.
    let t = test_app();
    empty_of_accounts(&t);

    let (status, body) = register(&t.app, "first@test.dev", "first").await;

    assert_eq!(status, StatusCode::OK);
    assert!(body["token"].is_string(), "registration opens a session");
    let perms = body["user"]["permissions"].as_array().expect("permissions");
    assert_eq!(
        perms.len(),
        Permission::all().len(),
        "the bootstrap owner gets every permission: {perms:?}"
    );
}

#[tokio::test]
async fn only_the_very_first_account_skips_the_invite() {
    // The second registration is invite-gated even though the first was not -
    // otherwise the server is open to anyone who finds it.
    let t = test_app();
    empty_of_accounts(&t);

    let (first, _) = register(&t.app, "first@test.dev", "first").await;
    assert_eq!(first, StatusCode::OK);

    let (second, body) = register(&t.app, "second@test.dev", "second").await;
    assert_eq!(second, StatusCode::FORBIDDEN);
    assert!(
        body["error"].as_str().is_some_and(|m| !m.is_empty()),
        "{body}"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn two_first_registrations_in_flight_leave_one_owner_and_one_refusal() {
    let t = test_app();
    empty_of_accounts(&t);

    let gate = Arc::new(Barrier::new(2));
    let racers = ["alice", "bob"].map(|name| {
        let app = t.app.clone();
        let gate = Arc::clone(&gate);
        tokio::spawn(async move {
            gate.wait().await;
            register(&app, &format!("{name}@test.dev"), name).await.0
        })
    });
    let mut outcomes = Vec::new();
    for racer in racers {
        outcomes.push(racer.await.expect("a racer finished"));
    }
    outcomes.sort_by_key(StatusCode::as_u16);

    assert_eq!(
        outcomes,
        vec![StatusCode::OK, StatusCode::FORBIDDEN],
        "one claims the server, the other is an ordinary signup with no invite"
    );
    let roster = crate::db::list_users(&t.state.db).expect("the roster");
    assert_eq!(roster.len(), 1, "{roster:?}");
    let owner = crate::db::user_by_id(&t.state.db, &roster[0].id)
        .expect("the owner")
        .expect("the owner");
    assert_eq!(owner.permissions, Permission::all());

    let (third, _) = register(&t.app, "carol@test.dev", "carol").await;
    assert_eq!(third, StatusCode::FORBIDDEN);
}
