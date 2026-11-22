use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::api::test_support::{
    PASSWORD, TestApp, get, household_where_the_viewer_is_held_at_ten, rate_item, seed_session,
    seed_session_pw, send, test_app,
};
use crate::model::Permission;

fn admin_with_password(app: &TestApp) -> String {
    seed_session_pw(
        &app.state,
        "admin@test.dev",
        "admin",
        PASSWORD,
        &[Permission::UsersManage, Permission::Playback],
    )
    .1
}

fn reader(t: &TestApp) -> String {
    seed_session(
        &t.state,
        "reader@test.dev",
        "reader",
        &[Permission::Playback],
    )
    .1
}

async fn pick_country(t: &TestApp, reader: &str, country: Value) -> (StatusCode, Value) {
    let body = Some(json!({ "country": country }));
    send(&t.app, "PUT", "/api/auth/me/ratings", Some(reader), body).await
}

#[tokio::test]
async fn a_person_picks_their_ratings_country_and_the_badge_follows_it() {
    let t = test_app();
    let reader = reader(&t);
    let film = crate::api::test_support::demo_item_id("The Matrix");
    rate_item(&t.state.db, &film, &[("FR", "12"), ("US", "R")]);
    let uri = format!("/api/items/{film}");

    let (_, before) = get(&t.app, &uri, Some(&reader)).await;
    let (status, chosen) = pick_country(&t, &reader, json!("fr")).await;
    let (_, after) = get(&t.app, &uri, Some(&reader)).await;

    assert_eq!(before["metadata"]["ageRating"]["country"], json!("US"));
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        (&chosen["country"], &chosen["household"]),
        (&json!("FR"), &json!("US"))
    );
    assert_eq!(
        after["metadata"]["ageRating"],
        json!({ "label": "12", "country": "FR", "borrowed": false })
    );
    assert_eq!(after["metadata"]["certification"], json!("12"));
}

#[tokio::test]
async fn a_country_with_no_known_rating_system_is_refused_and_null_follows_the_household() {
    let t = test_app();
    let reader = reader(&t);

    let (refused, _) = pick_country(&t, &reader, json!("ZZ")).await;
    let (status, cleared) = pick_country(&t, &reader, Value::Null).await;
    let (_, read) = get(&t.app, "/api/auth/me/ratings", Some(&reader)).await;

    assert_eq!(refused, StatusCode::BAD_REQUEST);
    assert_eq!(status, StatusCode::OK);
    assert_eq!(cleared["country"], Value::Null);
    assert_eq!(read["household"], json!("US"));
    let offered = read["countries"].as_array().cloned().unwrap_or_default();
    assert!(offered.contains(&json!("FR")) && offered.contains(&json!("US")));
}

#[tokio::test]
async fn the_ceiling_a_profile_carries_is_read_by_an_admin() {
    let h = household_where_the_viewer_is_held_at_ten();
    let admin = admin_with_password(&h.app);

    let (status, read) = get(
        &h.app.app,
        &format!("/api/admin/users/{}/restrictions", h.viewer_id),
        Some(&admin),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(read, json!({ "level": 10, "held": true, "titles": [] }));
}

#[tokio::test]
async fn an_admin_sets_a_profiles_level_after_typing_their_own_password() {
    let h = household_where_the_viewer_is_held_at_ten();
    let admin = admin_with_password(&h.app);
    let uri = format!("/api/admin/users/{}/restrictions/level", h.viewer_id);

    let (wrong, _) = send(
        &h.app.app,
        "PUT",
        &uri,
        Some(&admin),
        Some(json!({ "level": 18, "password": "not-it" })),
    )
    .await;
    let (status, _) = send(
        &h.app.app,
        "PUT",
        &uri,
        Some(&admin),
        Some(json!({ "level": 18, "password": PASSWORD })),
    )
    .await;
    let (seen, _) = get(
        &h.app.app,
        &format!("/api/items/{}", h.old_film),
        Some(&h.viewer),
    )
    .await;

    assert_eq!(wrong, StatusCode::UNAUTHORIZED);
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(seen, StatusCode::OK);
}

#[tokio::test]
async fn a_level_that_is_not_one_of_the_six_is_refused() {
    let h = household_where_the_viewer_is_held_at_ten();
    let admin = admin_with_password(&h.app);

    let (status, _) = send(
        &h.app.app,
        "PUT",
        &format!("/api/admin/users/{}/restrictions/level", h.viewer_id),
        Some(&admin),
        Some(json!({ "level": 12, "password": PASSWORD })),
    )
    .await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn no_profile_changes_its_own_level() {
    let h = household_where_the_viewer_is_held_at_ten();
    let admin_app = &h.app;
    let (admin_id, admin) = seed_session_pw(
        &admin_app.state,
        "admin@test.dev",
        "admin",
        PASSWORD,
        &[Permission::UsersManage],
    );

    let (own, _) = send(
        &h.app.app,
        "PUT",
        &format!("/api/admin/users/{admin_id}/restrictions/level"),
        Some(&admin),
        Some(json!({ "level": 10, "password": PASSWORD })),
    )
    .await;
    let (kid, _) = send(
        &h.app.app,
        "PUT",
        &format!("/api/admin/users/{}/restrictions/level", h.viewer_id),
        Some(&h.viewer),
        Some(json!({ "level": 18, "password": PASSWORD })),
    )
    .await;

    assert_eq!(own, StatusCode::FORBIDDEN);
    assert_eq!(kid, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn an_account_that_runs_the_server_is_never_put_under_a_ceiling() {
    let t = test_app();
    let admin = admin_with_password(&t);

    let (status, _) = send(
        &t.app,
        "PUT",
        &format!("/api/admin/users/{}/restrictions/level", t.user_id),
        Some(&admin),
        Some(json!({ "level": 7, "password": PASSWORD })),
    )
    .await;

    assert_eq!(status, StatusCode::CONFLICT);
}
