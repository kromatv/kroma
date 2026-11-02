use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{get, seed_session, send, test_app, test_app_as_package};
use crate::model::Permission;
use crate::services::updates::{restart_requested, OPERATION_KEY};

const RESTART: &str = "/api/admin/server/restart";

#[tokio::test]
async fn a_server_nothing_would_start_again_does_not_offer_a_restart() {
    let t = test_app();

    let (_, updates) = get(&t.app, "/api/admin/updates", Some(&t.token)).await;
    let (status, body) = send(&t.app, "POST", RESTART, Some(&t.token), None).await;

    assert_eq!(updates["restartable"], json!(false));
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["code"], json!("admin.serverRestartUnsupported"));
}

#[tokio::test]
async fn only_an_owner_who_manages_settings_may_restart() {
    let t = test_app_as_package();
    let (_, ana) = seed_session(&t.state, "ana@test.dev", "ana", &[Permission::UsersManage]);

    let (status, _) = send(&t.app, "POST", RESTART, Some(&ana), None).await;

    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn a_restart_waits_for_the_update_being_applied() {
    let t = test_app_as_package();
    let applying = json!({
        "id": "applying",
        "target": { "channel": "Stable", "version": "999.0.0", "build": 1 },
        "phase": "installing",
        "message": null,
        "requestedAt": "2026-11-02T10:00:00Z",
    });
    t.state
        .settings
        .set_internal(&t.state.db, OPERATION_KEY, applying)
        .unwrap();

    let (status, body) = send(&t.app, "POST", RESTART, Some(&t.token), None).await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["code"], json!("admin.serverRestartDuringUpdate"));
}

#[tokio::test]
async fn the_package_answers_then_stops_to_be_started_again() {
    let t = test_app_as_package();

    let (_, updates) = get(&t.app, "/api/admin/updates", Some(&t.token)).await;
    let (status, _) = send(&t.app, "POST", RESTART, Some(&t.token), None).await;

    assert_eq!(updates["restartable"], json!(true));
    assert_eq!(status, StatusCode::ACCEPTED);
    assert!(restart_requested());
}

#[tokio::test]
async fn health_names_the_process_that_answers() {
    let t = test_app();

    let (_, first) = get(&t.app, "/api/health", None).await;
    let (_, again) = get(&t.app, "/api/health", None).await;

    assert!(first["bootId"].as_str().is_some_and(|id| !id.is_empty()));
    assert_eq!(first["bootId"], again["bootId"]);
}
