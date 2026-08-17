//! Integration tests for opt-in crash reporting: clients post crashes to the
//! public `/api/diagnostics/crash`, admins read them at
//! `/api/admin/diagnostics/crashes`. Driven through the real router. The ring is
//! process-global, so these assert on a unique marker rather than exact counts.

use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{get, raw, seed_session, send, test_app};
use crate::model::Permission;

fn crash(marker: &str) -> Value {
    json!({
        "message": format!("boom {marker}"),
        "stack": "at render\nat commit",
        "platform": "Android TV",
        "capturedAt": 1_700_000_000_000i64,
        "build": { "version": "1.2.3", "commit": "abc123" },
        "device": { "model": "BRAVIA 4K", "os": "Android TV 14" },
    })
}

fn find<'a>(crashes: &'a Value, marker: &str) -> Option<&'a Value> {
    crashes
        .as_array()?
        .iter()
        .find(|c| c["message"] == json!(format!("boom {marker}")))
}

#[tokio::test]
async fn a_valid_crash_is_accepted_and_surfaces_in_the_admin_list() {
    let t = test_app();
    let (status, body) = send(
        &t.app,
        "POST",
        "/api/diagnostics/crash",
        None,
        Some(crash("alpha")),
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED);
    assert_eq!(body["ok"], json!(true));

    let (status, list) = get(&t.app, "/api/admin/diagnostics/crashes", Some(&t.token)).await;
    assert_eq!(status, StatusCode::OK);
    let record = find(&list["crashes"], "alpha").expect("the crash we just posted");
    assert_eq!(record["platform"], json!("Android TV"));
    assert_eq!(record["build"]["version"], json!("1.2.3"));
    assert_eq!(record["device"]["model"], json!("BRAVIA 4K"));
    assert!(record["seq"].as_u64().is_some());
    assert!(record["receivedAt"].as_i64().is_some());
}

#[tokio::test]
async fn a_crash_needs_no_session_but_the_admin_list_does() {
    let t = test_app();
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/diagnostics/crash",
        None,
        Some(crash("beta")),
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED);

    let (status, _) = get(&t.app, "/api/admin/diagnostics/crashes", None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (_id, member) = seed_session(
        &t.state,
        "peon-d@test.dev",
        "peon-d",
        &[Permission::Playback],
    );
    let (status, _) = get(&t.app, "/api/admin/diagnostics/crashes", Some(&member)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn an_empty_message_is_rejected() {
    let t = test_app();
    let mut body = crash("gamma");
    body["message"] = json!("   ");
    let (status, _) = send(&t.app, "POST", "/api/diagnostics/crash", None, Some(body)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_malformed_body_is_rejected() {
    let t = test_app();
    let (status, _) = send(
        &t.app,
        "POST",
        "/api/diagnostics/crash",
        None,
        Some(json!({ "message": "no build or platform" })),
    )
    .await;
    assert!(status.is_client_error(), "{status}");
}

#[tokio::test]
async fn an_oversized_body_is_rejected_by_the_body_limit() {
    let t = test_app();
    let mut body = crash("delta");
    body["stack"] = json!("x".repeat(70_000));
    let (status, _, _) = raw(
        &t.app,
        "POST",
        "/api/diagnostics/crash",
        None,
        Some(body),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn a_crash_without_device_metadata_is_still_stored() {
    let t = test_app();
    let mut body = crash("epsilon");
    body.as_object_mut().unwrap().remove("device");
    let (status, _) = send(&t.app, "POST", "/api/diagnostics/crash", None, Some(body)).await;
    assert_eq!(status, StatusCode::ACCEPTED);

    let (_, list) = get(&t.app, "/api/admin/diagnostics/crashes", Some(&t.token)).await;
    let record = find(&list["crashes"], "epsilon").expect("stored without device");
    assert_eq!(record["device"], json!(null));
}
