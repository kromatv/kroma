use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::api::test_support::{TestApp, get, seed_session, send, test_app};
use crate::model::Permission;

pub(super) async fn create_kids(t: &TestApp, body: Value) -> (StatusCode, Value) {
    send(
        &t.app,
        "POST",
        "/api/admin/kids",
        Some(&t.token),
        Some(body),
    )
    .await
}

pub(super) async fn kids_profile(t: &TestApp, name: &str) -> String {
    let (status, made) = create_kids(t, json!({ "username": name, "level": 7 })).await;
    assert_eq!(status, StatusCode::OK, "{made}");
    made["user"]["id"]
        .as_str()
        .expect("the new profile's id")
        .to_string()
}

#[tokio::test]
async fn an_admin_creates_a_kids_profile_with_a_kids_level_and_no_credential() {
    let t = test_app();

    let (status, made) = create_kids(&t, json!({ "username": "Léo", "level": 7 })).await;

    assert_eq!(status, StatusCode::OK, "{made}");
    let id = made["user"]["id"].as_str().expect("an id");
    let (_, read) = get(
        &t.app,
        &format!("/api/admin/users/{id}/restrictions"),
        Some(&t.token),
    )
    .await;
    assert_eq!(read["level"], json!(7));
    let (_, members) = get(&t.app, "/api/admin/users", Some(&t.token)).await;
    let row = members["users"]
        .as_array()
        .and_then(|rows| rows.iter().find(|row| row["id"] == json!(id)))
        .cloned()
        .expect("the profile is a member");
    assert_eq!((&row["kids"], &row["email"]), (&json!(true), &Value::Null));
}

#[tokio::test]
async fn a_kids_profile_takes_a_kids_level_and_none_is_picked_for_the_admin() {
    let t = test_app();

    let (thirteen, _) = create_kids(&t, json!({ "username": "Teen", "level": 13 })).await;
    let (missing, _) = create_kids(&t, json!({ "username": "Teen" })).await;
    let (unnamed, _) = create_kids(&t, json!({ "username": "  ", "level": 0 })).await;

    assert_eq!(thirteen, StatusCode::BAD_REQUEST);
    assert_eq!(missing, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(unnamed, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn only_an_account_that_manages_users_creates_a_kids_profile() {
    let t = test_app();
    let (_, member) = seed_session(&t.state, "m@test.dev", "member", &[Permission::Playback]);

    let (status, _) = send(
        &t.app,
        "POST",
        "/api/admin/kids",
        Some(&member),
        Some(json!({ "username": "Léo", "level": 7 })),
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn a_kids_profile_is_never_made_an_admin() {
    let t = test_app();
    let kid = kids_profile(&t, "Léo").await;

    let (status, _) = send(
        &t.app,
        "PATCH",
        &format!("/api/admin/users/{kid}"),
        Some(&t.token),
        Some(json!({ "permissions": ["playback", "library.manage"] })),
    )
    .await;

    assert_eq!(status, StatusCode::CONFLICT);
}

#[tokio::test]
async fn nobody_signs_in_to_a_kids_profile_by_its_name_or_by_a_reset_link() {
    let t = test_app();
    let kid = kids_profile(&t, "Léo").await;

    let login = json!({ "email": "Léo", "password": "" });
    let (signed_in, _) = send(&t.app, "POST", "/api/auth/login", None, Some(login)).await;
    let reset_uri = format!("/api/admin/users/{kid}/reset");
    let (reset, _) = send(&t.app, "POST", &reset_uri, Some(&t.token), None).await;
    let (_, public) = get(&t.app, "/api/users", None).await;

    assert_eq!(signed_in, StatusCode::UNAUTHORIZED);
    assert_eq!(reset, StatusCode::CONFLICT);
    assert!(!public.to_string().contains(&kid), "{public}");
}
