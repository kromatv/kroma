use axum::http::StatusCode;
use serde_json::{Value, json};

use super::creating::create_kids;
use crate::api::test_support::{PASSWORD, TestApp, get, seed_session_pw, send, test_app};
use crate::model::Permission;

async fn restrictions(t: &TestApp, admin: &str, id: &str) -> Value {
    let uri = format!("/api/admin/users/{id}/restrictions");
    let (status, read) = get(&t.app, &uri, Some(admin)).await;
    assert_eq!(status, StatusCode::OK, "{read}");
    read
}

async fn put_country(t: &TestApp, admin: &str, (id, password): (&str, &str)) -> StatusCode {
    let uri = format!("/api/admin/users/{id}/restrictions/country");
    let body = json!({ "country": "GB", "password": password });
    send(&t.app, "PUT", &uri, Some(admin), Some(body)).await.0
}

async fn made(t: &TestApp, body: Value) -> String {
    let (status, made) = create_kids(t, body).await;
    assert_eq!(status, StatusCode::OK, "{made}");
    made["user"]["id"].as_str().expect("an id").to_string()
}

#[tokio::test]
async fn a_kids_profile_takes_the_ratings_country_of_the_admin_who_creates_it() {
    let t = test_app();
    let mine = json!({ "country": "CH" });
    send(
        &t.app,
        "PUT",
        "/api/auth/me/ratings",
        Some(&t.token),
        Some(mine),
    )
    .await;

    let id = made(&t, json!({ "username": "Léo", "level": 10 })).await;

    assert_eq!(
        restrictions(&t, &t.token, &id).await["ratingsCountry"],
        json!("CH")
    );
}

#[tokio::test]
async fn an_admin_with_no_country_of_their_own_gives_the_households() {
    let t = test_app();
    let swiss = json!({ "ratingsCountry": "CH" });
    send(
        &t.app,
        "PUT",
        "/api/admin/settings",
        Some(&t.token),
        Some(swiss),
    )
    .await;

    let id = made(&t, json!({ "username": "Léo", "level": 10 })).await;

    let read = restrictions(&t, &t.token, &id).await;
    assert_eq!(
        (&read["ratingsCountry"], &read["household"]),
        (&json!("CH"), &json!("CH"))
    );
}

#[tokio::test]
async fn an_admin_picks_another_country_in_the_create_form() {
    let t = test_app();

    let id = made(
        &t,
        json!({ "username": "Léo", "level": 7, "ratingsCountry": "de" }),
    )
    .await;
    let (unknown, _) = create_kids(
        &t,
        json!({ "username": "Zoé", "level": 7, "ratingsCountry": "ZZ" }),
    )
    .await;

    assert_eq!(
        restrictions(&t, &t.token, &id).await["ratingsCountry"],
        json!("DE")
    );
    assert_eq!(unknown, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn an_admin_changes_a_profiles_ratings_country_after_typing_their_password() {
    let t = test_app();
    let id = made(&t, json!({ "username": "Léo", "level": 10 })).await;
    let admin = seed_session_pw(
        &t.state,
        "admin@test.dev",
        "admin",
        PASSWORD,
        &[Permission::UsersManage, Permission::Playback],
    )
    .1;

    let wrong = put_country(&t, &admin, (&id, "not-it")).await;
    let status = put_country(&t, &admin, (&id, PASSWORD)).await;

    assert_eq!(wrong, StatusCode::UNAUTHORIZED);
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(
        restrictions(&t, &admin, &id).await["ratingsCountry"],
        json!("GB")
    );
}
