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
