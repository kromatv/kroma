use axum::http::StatusCode;
use serde_json::{Value, json};

use super::creating::kids_profile;
use crate::api::test_support::{TestApp, get, seed_access_token, seed_session, send, test_app};
use crate::model::Permission;

async fn listed(t: &TestApp, access: &str) -> (StatusCode, Value) {
    let body = Some(json!({ "accessToken": access }));
    send(&t.app, "POST", "/api/kids/list", None, body).await
}

pub(super) async fn open(t: &TestApp, (kid, access): (&str, &str)) -> (StatusCode, Value) {
    let body = Some(json!({ "accessToken": access, "profile": kid }));
    send(&t.app, "POST", "/api/kids/open", None, body).await
}

pub(super) fn member_device(t: &TestApp) -> String {
    let (id, _) = seed_session(&t.state, "m@test.dev", "member", &[Permission::Playback]);
    seed_access_token(&t.state, &id, false)
}

#[tokio::test]
async fn a_device_a_member_is_signed_in_on_lists_the_kids_profiles() {
    let t = test_app();
    let kid = kids_profile(&t, "Léo").await;
    let access = member_device(&t);

    let (status, kids) = listed(&t, &access).await;
    let (stranger, _) = listed(&t, "not-a-token").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(kids["profiles"][0]["id"], json!(kid));
    assert_eq!(kids["profiles"][0]["username"], json!("Léo"));
    assert_eq!(stranger, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn opening_a_kids_profile_gives_the_device_a_session_of_it_held_to_its_level() {
    let t = test_app();
    let kid = kids_profile(&t, "Léo").await;
    let access = member_device(&t);

    let (status, opened) = open(&t, (&kid, &access)).await;

    assert_eq!(status, StatusCode::OK, "{opened}");
    assert_eq!(opened["user"]["id"], json!(kid));
    let session = opened["token"].as_str().expect("a session");
    let (_, me) = get(&t.app, "/api/auth/me", Some(session)).await;
    assert_eq!(me["user"]["id"], json!(kid));
    let (_, devices) = get(&t.app, "/api/auth/me/sessions", Some(session)).await;
    assert_eq!(devices.as_array().map(Vec::len), Some(1), "{devices}");
    let (_, movies) = get(&t.app, "/api/movies", Some(session)).await;
    assert_eq!(movies, json!([]), "every demo title is unrated");
}

#[tokio::test]
async fn a_kids_session_opens_no_other_profile_and_an_account_is_opened_only_as_a_kids_profile() {
    let t = test_app();
    let kid = kids_profile(&t, "Léo").await;
    let sibling = kids_profile(&t, "Zoé").await;
    let access = member_device(&t);
    let (_, opened) = open(&t, (&kid, &access)).await;
    let kid_access = opened["accessToken"]
        .as_str()
        .expect("the kid's device token");

    let (from_a_kid, _) = open(&t, (&sibling, kid_access)).await;
    let (an_adult, _) = open(&t, (&t.user_id, &access)).await;

    assert_eq!(from_a_kid, StatusCode::UNAUTHORIZED);
    assert_eq!(an_adult, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn an_admin_revokes_a_kids_session_like_any_other() {
    let t = test_app();
    let kid = kids_profile(&t, "Léo").await;
    let access = member_device(&t);
    let (_, opened) = open(&t, (&kid, &access)).await;
    let session = opened["token"].as_str().expect("a session").to_string();

    let (status, _) = send(
        &t.app,
        "DELETE",
        &format!("/api/admin/users/{kid}"),
        Some(&t.token),
        None,
    )
    .await;
    let (after, _) = get(&t.app, "/api/auth/me", Some(&session)).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(after, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn a_kids_session_vouches_for_no_other_device_and_takes_no_credential() {
    let t = test_app();
    let kid = kids_profile(&t, "Léo").await;
    let access = member_device(&t);
    let (_, opened) = open(&t, (&kid, &access)).await;
    let session = opened["token"].as_str().expect("a session").to_string();

    let mut refused = Vec::new();
    for (uri, body) in [
        ("/api/auth/quickconnect/authorize", json!({ "code": "ABC123" })),
        ("/api/auth/me/passkeys/register/start", json!({})),
        ("/api/handoff/grant", json!({ "code": "ABC123" })),
        ("/api/auth/me/identities", json!({ "provider": "google" })),
    ] {
        refused.push(send(&t.app, "POST", uri, Some(&session), Some(body)).await.0);
    }

    assert_eq!(refused, vec![StatusCode::FORBIDDEN; 4]);
}
