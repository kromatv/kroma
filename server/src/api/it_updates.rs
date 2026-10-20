use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{get, seed_session, send, test_app};
use crate::model::Permission;
use crate::services::updates::STATUS_KEY;

#[tokio::test]
async fn a_server_that_never_checked_says_so_and_offers_nothing() {
    let t = test_app();

    let (status, body) = get(&t.app, "/api/admin/updates", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["channel"], json!("Stable"));
    assert_eq!(body["available"], json!(false));
    assert!(body["latest"].is_null());
    assert!(body["checkedAt"].is_null());
}

#[tokio::test]
async fn a_stored_newer_release_is_offered_on_its_channel() {
    let t = test_app();
    t.state
        .settings
        .set_internal(
            &t.state.db,
            STATUS_KEY,
            json!({
                "channel": "Stable",
                "latest": { "version": "999.0.0", "build": null, "url": "https://x", "publishedAt": null },
                "checkedAt": "2026-10-20T10:00:00Z",
                "error": null,
            }),
        )
        .unwrap();

    let (_, body) = get(&t.app, "/api/admin/updates", Some(&t.token)).await;

    assert_eq!(body["available"], json!(true));
    assert_eq!(body["latest"]["version"], json!("999.0.0"));
    assert_eq!(body["checkedAt"], json!("2026-10-20T10:00:00Z"));
}

#[tokio::test]
async fn a_member_cannot_read_or_run_the_check() {
    let t = test_app();
    let ana = seed_session(&t.state, "ana@test.dev", "ana", &[Permission::Playback]).1;

    let (read, _) = get(&t.app, "/api/admin/updates", Some(&ana)).await;
    let (run, _) = send(&t.app, "POST", "/api/admin/updates/check", Some(&ana), None).await;

    assert_eq!(read, StatusCode::FORBIDDEN);
    assert_eq!(run, StatusCode::FORBIDDEN);
}
