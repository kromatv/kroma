use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{
    get, put_to_wait, raw, seed_session, seed_waiting, send, test_app, TestApp,
};
use crate::model::Permission;

fn member(t: &TestApp, username: &str) -> String {
    let address = format!("{username}@test.dev");
    seed_session(&t.state, &address, username, &[Permission::Playback]).0
}

async fn forgot(t: &TestApp, identifier: &str, from: &str) -> StatusCode {
    let (status, _, _) = raw(
        &t.app,
        "POST",
        "/api/auth/reset-request",
        None,
        Some(json!({ "identifier": identifier })),
        &[("cf-connecting-ip", from)],
    )
    .await;
    status
}

async fn reset_asked_for(t: &TestApp, user_id: &str) -> Value {
    let (_, members) = get(&t.app, "/api/admin/users", Some(&t.token)).await;
    members["users"]
        .as_array()
        .expect("the member list")
        .iter()
        .find(|member| member["id"] == json!(user_id))
        .expect("the account is on the member list")["resetRequested"]
        .clone()
}

async fn mint_link(t: &TestApp, user_id: &str, link: &str) -> StatusCode {
    let uri = format!("/api/admin/users/{user_id}/{link}");
    send(&t.app, "POST", &uri, Some(&t.token), None).await.0
}

#[tokio::test]
async fn forgetting_a_waiting_accounts_password_answers_as_for_anyone_and_flags_nothing() {
    let t = test_app();
    let (ana, bo) = (member(&t, "ana"), member(&t, "bo"));
    put_to_wait(&t.state, &ana);

    let waiting = forgot(&t, "ana", "10.73.2.3").await;
    let held = forgot(&t, "bo", "10.73.2.3").await;
    let stranger = forgot(&t, "nobody", "10.73.2.3").await;

    assert_eq!([waiting, held, stranger], [StatusCode::NO_CONTENT; 3]);
    assert_eq!(reset_asked_for(&t, &bo).await, json!(true));
    assert_eq!(reset_asked_for(&t, &ana).await, json!(false));
}

#[tokio::test]
async fn an_owner_mints_no_reset_and_no_verification_link_for_a_waiting_account() {
    let t = test_app();
    let ana = seed_waiting(&t.state, "ana", Some("ana@test.dev"));

    let reset = mint_link(&t, &ana, "reset").await;
    let verification = mint_link(&t, &ana, "email-verification").await;

    assert_eq!(reset, StatusCode::CONFLICT);
    assert_eq!(verification, StatusCode::CONFLICT);
}

#[tokio::test]
async fn a_reset_minted_before_the_account_waited_gives_it_no_password() {
    let t = test_app();
    let ana = member(&t, "ana");
    let uri = format!("/api/admin/users/{ana}/reset");
    let (_, minted) = send(&t.app, "POST", &uri, Some(&t.token), None).await;
    let token = minted["token"].as_str().expect("a reset token");
    put_to_wait(&t.state, &ana);

    let (_, check) = get(&t.app, &format!("/api/auth/reset/{token}"), None).await;
    let (redeem, _) = send(
        &t.app,
        "POST",
        "/api/auth/reset",
        None,
        Some(json!({ "token": token, "code": minted["code"], "password": "another-password" })),
    )
    .await;

    assert_eq!(check, json!({ "valid": false }));
    assert_eq!(redeem, StatusCode::BAD_REQUEST);
}
