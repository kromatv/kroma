//! An account that waits on an invitation, set up the way an import leaves it,
//! and the two steps that end the wait.

use axum::http::StatusCode;
use axum::Router;
use serde_json::{json, Value};

use super::{demo_library_ids, send, TestApp, PASSWORD};
use crate::db;
use crate::model::LibraryScope;
use crate::state::SharedState;

/// An account that waits, seeing the demo films only. Returns its id.
pub fn seed_waiting(state: &SharedState, username: &str, email: Option<&str>) -> String {
    let account = db::WaitingAccount {
        username,
        email,
        libraries: &LibraryScope::Only(vec![demo_library_ids().0]),
    };
    match db::create_waiting_account(&state.db, &account).expect("create a waiting account") {
        db::Awaited::Account(user) => user.id,
        other => panic!("{username} should wait, got {other:?}"),
    }
}

/// Marks an account as waiting whatever it holds, which no route can do: the
/// way to show that a door looks at the mark and not at the missing credential.
pub fn put_to_wait(state: &SharedState, user_id: &str) {
    state
        .db
        .get()
        .expect("db conn")
        .execute("UPDATE users SET waiting = 1 WHERE id = ?1", [user_id])
        .expect("mark the account as waiting");
}

/// The owner mints the account's invitation. Returns its token.
pub async fn mint_invitation(t: &TestApp, user_id: &str) -> String {
    let uri = format!("/api/admin/users/{user_id}/invitation");
    let (status, body) = send(&t.app, "POST", &uri, Some(&t.token), None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body["token"].as_str().expect("invitation token").to_string()
}

/// The join form, sent with `invite` and the harness password.
pub async fn join(app: &Router, invite: &str, email: &str, username: &str) -> (StatusCode, Value) {
    let body = json!({
        "email": email,
        "username": username,
        "password": PASSWORD,
        "inviteToken": invite,
    });
    send(app, "POST", "/api/auth/register", None, Some(body)).await
}
