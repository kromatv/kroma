use axum::http::StatusCode;
use serde_json::json;

use super::creating::kids_profile;
use super::opening::{member_device, open};
use crate::api::test_support::{TestApp, demo_item_id, get, hold_at, rate_item, send, test_app};
use crate::model::MaturityLevel;

async fn kids_session(t: &TestApp) -> (String, String) {
    let kid = kids_profile(t, "Léo").await;
    let access = member_device(t);
    let (_, opened) = open(t, (&kid, &access)).await;
    (
        kid,
        opened["token"].as_str().expect("a session").to_string(),
    )
}

async fn status(t: &TestApp, (method, uri): (&str, &str), session: &str) -> StatusCode {
    send(&t.app, method, uri, Some(session), Some(json!({})))
        .await
        .0
}

async fn kids_answers(calls: &[(&str, &str)]) -> Vec<StatusCode> {
    let t = test_app();
    let (_, session) = kids_session(&t).await;
    let mut answered = Vec::new();
    for call in calls {
        answered.push(status(&t, *call, &session).await);
    }
    answered
}

async fn patch_me(t: &TestApp, session: &str, body: serde_json::Value) -> StatusCode {
    send(&t.app, "PATCH", "/api/auth/me", Some(session), Some(body))
        .await
        .0
}

#[tokio::test]
async fn a_kids_session_says_so_until_its_level_leaves_the_kids_levels() {
    let t = test_app();
    let (kid, session) = kids_session(&t).await;

    let (_, me) = get(&t.app, "/api/auth/me", Some(&session)).await;
    let (_, owner) = get(&t.app, "/api/auth/me", Some(&t.token)).await;
    hold_at(&t.state.db, &kid, MaturityLevel::Thirteen);
    let (_, raised) = get(&t.app, "/api/auth/me", Some(&session)).await;

    assert_eq!(me["user"]["kids"], json!(true));
    assert_eq!(owner["user"]["kids"], json!(false));
    assert_eq!(raised["user"]["kids"], json!(false));
}

#[tokio::test]
async fn a_kids_session_is_refused_the_admin_the_store_requests_discovery_and_its_settings() {
    let calls = [
        ("GET", "/api/admin/users"),
        ("GET", "/api/admin/modules"),
        ("GET", "/api/requests"),
        ("GET", "/api/requests/calendar"),
        ("GET", "/api/monitoring"),
        ("GET", "/api/discover/trending"),
        ("GET", "/api/discover/search?q=dune"),
        ("PATCH", "/api/auth/me/password"),
        ("PUT", "/api/auth/me/ratings"),
        ("PATCH", "/api/auth/me/pin"),
        ("PUT", "/api/notifications/prefs"),
        ("DELETE", "/api/auth/me/sessions"),
        ("POST", "/api/users/avatar"),
    ];

    let answered = kids_answers(&calls).await;

    assert_eq!(answered, vec![StatusCode::FORBIDDEN; calls.len()]);
}

#[tokio::test]
async fn a_kids_session_keeps_its_player_languages_but_not_its_name() {
    let t = test_app();
    let (_, session) = kids_session(&t).await;

    let rename = patch_me(&t, &session, json!({ "username": "Captain" })).await;
    let languages = patch_me(&t, &session, json!({ "subtitleLanguage": "fr" })).await;

    assert_eq!(rename, StatusCode::FORBIDDEN);
    assert_eq!(languages, StatusCode::OK);
}

#[tokio::test]
async fn a_kids_session_sees_no_module_and_reaches_no_module_route() {
    let t = test_app();
    let (_, session) = kids_session(&t).await;

    let (_, modules) = get(&t.app, "/api/modules", Some(&session)).await;
    let routed = status(
        &t,
        ("GET", "/api/module/tv.kroma.trailers/anything"),
        &session,
    )
    .await;

    assert_eq!(modules, json!([]));
    assert_eq!(routed, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn search_stays_on_and_finds_only_what_the_profile_may_see() {
    let t = test_app();
    let (_, session) = kids_session(&t).await;
    rate_item(&t.state.db, &demo_item_id("Spirited Away"), &[("US", "G")]);
    rate_item(
        &t.state.db,
        &demo_item_id("Blade Runner 2049"),
        &[("US", "R")],
    );

    let (status, spirited) = get(&t.app, "/api/search?q=Spirited", Some(&session)).await;
    let (_, blade) = get(&t.app, "/api/search?q=Blade", Some(&session)).await;

    assert_eq!(status, StatusCode::OK);
    assert_ne!(spirited["results"], json!([]));
    assert_eq!(blade["results"], json!([]));
}

#[tokio::test]
async fn a_kids_profile_takes_no_right_beyond_watching() {
    let t = test_app();
    let kid = kids_profile(&t, "Léo").await;

    let rights = json!({ "permissions": ["playback", "requests.create"] });
    let uri = format!("/api/admin/users/{kid}");
    let (status, _) = send(&t.app, "PATCH", &uri, Some(&t.token), Some(rights)).await;

    assert_eq!(status, StatusCode::CONFLICT);
}
