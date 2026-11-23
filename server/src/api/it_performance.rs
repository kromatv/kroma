use std::time::Duration;

use axum::http::StatusCode;
use kroma_perf::{Measured, profiler};
use serde_json::{Value, json};
use tokio::sync::Mutex;

use crate::api::test_support::{get, raw, seed_session, send, test_app, text};
use crate::boot::profiling::PROFILING_KEY;
use crate::model::Permission;

/// Held by every test that reads or flips the process-wide profiler.
pub(crate) static SERIAL: Mutex<()> = Mutex::const_new(());

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
        .get_bool(PROFILING_KEY, true);
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
async fn a_made_up_module_id_is_named_by_the_route_template() {
    let _serial = SERIAL.lock().await;
    let t = test_app();
    get(&t.app, "/api/module/made.up.module/anything", Some(&t.token)).await;

    let (_, overview) = get(&t.app, "/api/admin/performance?window=1h", Some(&t.token)).await;

    let names = names(&overview);
    assert!(
        names.contains(&"GET /api/module/{id}/{*rest}".to_string()),
        "{names:?}"
    );
    assert!(names.iter().all(|name| !name.contains("made.up.module")));
}

fn a_slow_request() -> String {
    let scope = profiler().request("GET", "/test/slow-drawer").unwrap();
    let entered = scope.enter();
    for _ in 0..20 {
        profiler().record(Measured {
            kind: "sql",
            label: "SELECT id FROM items WHERE id = ?1",
            origin: Some("core"),
            elapsed: Duration::from_micros(50),
        });
    }
    drop(entered);
    profiler().finish(&scope, Some(200), None);
    scope.id().to_string()
}

#[tokio::test]
async fn a_slow_request_is_listed_and_opens_with_its_waterfall() {
    let _serial = SERIAL.lock().await;
    let t = test_app();
    let id = a_slow_request();

    let (_, listed) = get(&t.app, "/api/admin/performance/slow?window=1h", Some(&t.token)).await;
    let (status, one) = get(&t.app, &format!("/api/admin/performance/slow/{id}"), Some(&t.token)).await;
    let (missing, _) = get(&t.app, "/api/admin/performance/slow/not-an-id", Some(&t.token)).await;

    assert!(listed["requests"].as_array().unwrap().iter().any(|r| r["id"] == id));
    assert_eq!(status, StatusCode::OK);
    assert_eq!(one["waterfall"].as_array().unwrap().len(), 20);
    assert_eq!(missing, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_core_statement_has_a_query_plan() {
    let _serial = SERIAL.lock().await;
    let t = test_app();
    let id = a_slow_request();
    let (_, one) = get(&t.app, &format!("/api/admin/performance/slow/{id}"), Some(&t.token)).await;
    let key = one["waterfall"][0]["key"].as_str().unwrap().to_string();

    let (status, plan) = get(
        &t.app,
        &format!("/api/admin/performance/segments/{key}/plan"),
        Some(&t.token),
    )
    .await;
    let (unknown, _) = get(&t.app, "/api/admin/performance/segments/1/plan", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert!(plan["plan"].as_array().is_some_and(|steps| !steps.is_empty()), "{plan}");
    assert_eq!(unknown, StatusCode::NOT_FOUND);
}
