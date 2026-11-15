//! Integration tests for the app version a device names when it trades its
//! credential for a session, as the account's device list reports it.

use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{get, raw, seed_access_token, seed_session, test_app, TestApp};
use crate::model::{Permission, APP_VERSION_HEADER, MIN_CLIENT};

async fn device_after_exchange(t: &TestApp, headers: &[(&str, &str)]) -> Value {
    let (uid, _) = seed_session(&t.state, "tv@test.dev", "tv", &[Permission::Playback]);
    let access = seed_access_token(&t.state, &uid, true);

    let (status, _, session) = raw(
        &t.app,
        "POST",
        "/api/auth/token",
        None,
        Some(json!({ "accessToken": access })),
        headers,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let token = session["token"].as_str().expect("session token");

    let (_, devices) = get(&t.app, "/api/auth/me/sessions", Some(token)).await;
    devices
        .as_array()
        .expect("device list")
        .iter()
        .find(|d| d["current"] == json!(true))
        .expect("the calling device")
        .clone()
}

#[tokio::test]
async fn the_device_list_shows_the_app_version_a_device_last_named() {
    let t = test_app();
    let named = format!("webos/{MIN_CLIENT}");

    let device = device_after_exchange(&t, &[(APP_VERSION_HEADER, &named)]).await;

    assert_eq!(
        device["app"],
        json!({ "shell": "webos", "version": MIN_CLIENT })
    );
    assert_eq!(device["outdated"], json!(false));
}

#[tokio::test]
async fn a_device_below_the_oldest_version_served_is_marked_outdated() {
    let t = test_app();

    let device = device_after_exchange(&t, &[(APP_VERSION_HEADER, "tizen/0.0.1")]).await;

    assert_eq!(device["app"]["version"], json!("0.0.1"));
    assert_eq!(device["outdated"], json!(true));
}

#[tokio::test]
async fn a_device_that_never_named_its_app_is_unknown_and_never_outdated() {
    let t = test_app();

    let silent = device_after_exchange(&t, &[]).await;
    let garbled = device_after_exchange(&test_app(), &[(APP_VERSION_HEADER, "not a version")]).await;

    for device in [silent, garbled] {
        assert_eq!(device["app"], Value::Null);
        assert_eq!(device["outdated"], json!(false));
    }
}

#[tokio::test]
async fn the_device_list_says_where_a_device_reached_the_server_from() {
    let t = test_app();

    let device = device_after_exchange(&t, &[]).await;

    assert_eq!(device["address"], json!("127.0.0.1"));
    assert_eq!(device["via"], json!("lan"));
}

#[tokio::test]
async fn the_calling_device_is_listed_first_whatever_was_seen_last() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "tv@test.dev", "tv", &[Permission::Playback]);
    let older = seed_access_token(&t.state, &uid, true);
    let (_, _, mine) = raw(
        &t.app,
        "POST",
        "/api/auth/token",
        None,
        Some(json!({ "accessToken": older })),
        &[],
    )
    .await;
    let later = seed_access_token(&t.state, &uid, true);
    raw(
        &t.app,
        "POST",
        "/api/auth/token",
        None,
        Some(json!({ "accessToken": later })),
        &[],
    )
    .await;

    let (_, devices) = get(
        &t.app,
        "/api/auth/me/sessions",
        mine["token"].as_str(),
    )
    .await;

    assert_eq!(devices[0]["current"], json!(true));
    assert!(devices.as_array().unwrap().len() >= 3);
}

#[tokio::test]
async fn signing_every_other_device_out_keeps_only_the_calling_one() {
    let t = test_app();
    let (uid, _) = seed_session(&t.state, "tv@test.dev", "tv", &[Permission::Playback]);
    let access = seed_access_token(&t.state, &uid, true);
    seed_access_token(&t.state, &uid, true);
    let (_, _, mine) = raw(
        &t.app,
        "POST",
        "/api/auth/token",
        None,
        Some(json!({ "accessToken": access })),
        &[],
    )
    .await;
    let token = mine["token"].as_str().expect("session token");

    let (status, _, _) = raw(&t.app, "DELETE", "/api/auth/me/sessions", Some(token), None, &[]).await;
    let (_, devices) = get(&t.app, "/api/auth/me/sessions", Some(token)).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    let left = devices.as_array().expect("device list");
    assert_eq!(left.len(), 1);
    assert_eq!(left[0]["current"], json!(true));
}
