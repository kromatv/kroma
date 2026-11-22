use axum::http::StatusCode;
use serde_json::{Value, json};
use tokio::sync::Mutex;

use crate::api::test_support::{get, raw, seed_session, send, test_app, text};
use crate::model::Permission;

static SERIAL: Mutex<()> = Mutex::const_new(());

fn names(overview: &Value) -> Vec<String> {
    overview["requests"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["name"].as_str().unwrap().to_string())
        .collect()
}

#[tokio::test]
async fn a_request_answers_with_its_server_timing() {
    let _serial = SERIAL.lock().await;
    let t = test_app();

    let (status, headers, _) =
        raw(&t.app, "GET", "/api/libraries", Some(&t.token), None, &[]).await;

    assert_eq!(status, StatusCode::OK);
    let timing = headers["server-timing"].to_str().unwrap();
    assert!(timing.starts_with("total;dur="), "{timing}");
    assert_eq!(headers["timing-allow-origin"], "*");
}

#[tokio::test]
async fn the_overview_names_a_route_by_its_template_even_under_the_admin_nest() {
    let _serial = SERIAL.lock().await;
    let t = test_app();
    get(&t.app, "/api/admin/server", Some(&t.token)).await;
    get(&t.app, "/api/items/no-such-item", Some(&t.token)).await;

    let (status, overview) = get(&t.app, "/api/admin/performance?window=1h", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    let names = names(&overview);
    assert!(
        names.contains(&"GET /api/admin/server".to_string()),
        "{names:?}"
    );
    assert!(
        names.contains(&"GET /api/items/{id}".to_string()),
        "{names:?}"
    );
    assert_eq!(overview["window"], "1h");
}

#[tokio::test]
async fn reading_the_measurements_needs_an_admin() {
    let _serial = SERIAL.lock().await;
    let t = test_app();
    let (_, member) = seed_session(
        &t.state,
        "viewer@test.dev",
        "viewer",
        &[Permission::Playback],
    );

    let (status, _) = get(&t.app, "/api/admin/performance", Some(&member)).await;

    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn switching_profiling_needs_the_settings_capability() {
    let _serial = SERIAL.lock().await;
    let t = test_app();
    let (_, reader) = seed_session(
        &t.state,
        "reports@test.dev",
        "reports",
        &[Permission::ReportsManage],
    );

    let (status, _) = send(
        &t.app,
        "PUT",
        "/api/admin/performance/enabled",
        Some(&reader),
        Some(json!({ "enabled": false })),
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn a_switched_off_server_sends_no_timing_and_remembers_the_choice() {
    let _serial = SERIAL.lock().await;
    let t = test_app();

    let (status, _) = send(
        &t.app,
        "PUT",
        "/api/admin/performance/enabled",
        Some(&t.token),
        Some(json!({ "enabled": false })),
    )
    .await;
    let (_, headers, _) = raw(&t.app, "GET", "/api/libraries", Some(&t.token), None, &[]).await;
    let stored = t
        .state
        .settings
        .get_bool(crate::services::settings::PROFILING_KEY, true);
    send(
        &t.app,
        "PUT",
        "/api/admin/performance/enabled",
        Some(&t.token),
        Some(json!({ "enabled": true })),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert!(!headers.contains_key("server-timing"));
    assert!(!stored);
}

#[tokio::test]
async fn the_export_is_one_json_record_per_line_opened_by_its_meta() {
    let _serial = SERIAL.lock().await;
    let t = test_app();
    get(&t.app, "/api/libraries", Some(&t.token)).await;

    let (status, body) = text(
        &t.app,
        "GET",
        "/api/admin/performance/export?window=1h",
        Some(&t.token),
        None,
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let records: Vec<Value> = body
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(records[0]["type"], "meta");
    assert_eq!(records[0]["source"]["product"], "KROMA");
    assert!(
        records
            .iter()
            .any(|r| r["type"] == "request" && r["name"] == "GET /api/libraries")
    );
}

#[tokio::test]
async fn the_markdown_export_is_a_ranked_summary() {
    let _serial = SERIAL.lock().await;
    let t = test_app();
    get(&t.app, "/api/libraries", Some(&t.token)).await;

    let (status, body) = text(
        &t.app,
        "GET",
        "/api/admin/performance/export?window=1h&format=md",
        Some(&t.token),
        None,
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert!(body.starts_with("# Performance report"), "{body}");
    assert!(body.contains("`GET /api/libraries`"));
}
