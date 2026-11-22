use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::api::test_support::{TestApp, get, seed_session, send, test_app};
use crate::model::Permission;

const SCHEDULE: &str = "/api/admin/backup/schedule";

async fn change(t: &TestApp, body: Value) -> (StatusCode, Value) {
    send(&t.app, "PUT", SCHEDULE, Some(&t.token), Some(body)).await
}

async fn schedule_of(t: &TestApp) -> Value {
    get(&t.app, SCHEDULE, Some(&t.token)).await.1
}

#[tokio::test]
async fn a_new_server_saves_no_backup_by_itself() {
    let t = test_app();

    let schedule = schedule_of(&t).await;

    assert_eq!(schedule["enabled"], false);
    assert_eq!(schedule["keep"], 7);
    assert_eq!(schedule["chosen"], false);
}

#[tokio::test]
async fn the_owner_turns_scheduled_backups_on() {
    let t = test_app();

    change(&t, json!({ "enabled": true })).await;

    assert_eq!(schedule_of(&t).await["enabled"], true);
}

#[tokio::test]
async fn a_folder_the_picker_offers_is_kept_resolved() {
    let t = test_app();
    let folder = kroma_testing::temp_dir("backup-schedule");
    let asked = format!("{}/.", folder.path().display());

    let (_, schedule) = change(&t, json!({ "folder": asked })).await;

    let resolved = std::fs::canonicalize(folder.path()).unwrap();
    assert_eq!(schedule["folder"], json!(resolved.to_string_lossy()));
    assert_eq!(schedule["chosen"], true);
}

#[tokio::test]
async fn a_folder_that_is_not_there_is_refused() {
    let t = test_app();

    let (status, _) = change(&t, json!({ "folder": "/nowhere/kroma/backups" })).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_folder_named_through_dot_dot_is_refused() {
    let t = test_app();
    let folder = kroma_testing::temp_dir("backup-schedule");
    let asked = format!("{}/..", folder.path().display());

    let (status, _) = change(&t, json!({ "folder": asked })).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_count_outside_one_to_365_is_refused() {
    let t = test_app();

    let (status, _) = change(&t, json!({ "keep": 0 })).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn an_empty_folder_goes_back_to_the_data_folder() {
    let t = test_app();
    let folder = kroma_testing::temp_dir("backup-schedule");
    change(&t, json!({ "folder": folder.path().to_string_lossy() })).await;

    let (_, schedule) = change(&t, json!({ "folder": "" })).await;

    assert_eq!(schedule["chosen"], false);
}

#[tokio::test]
async fn the_settings_route_cannot_point_the_backups_elsewhere() {
    let t = test_app();
    let patch = json!({ "backupFolder": "/etc", "backupAuto": true });

    send(
        &t.app,
        "PUT",
        "/api/admin/settings",
        Some(&t.token),
        Some(patch),
    )
    .await;

    let schedule = schedule_of(&t).await;
    assert_eq!(
        (schedule["chosen"].clone(), schedule["enabled"].clone()),
        (json!(false), json!(false))
    );
}

#[tokio::test]
async fn a_member_reads_no_schedule() {
    let t = test_app();
    let (_, member) = seed_session(
        &t.state,
        "member@test.dev",
        "member",
        &[Permission::Playback],
    );

    let (status, _) = get(&t.app, SCHEDULE, Some(&member)).await;

    assert_eq!(status, StatusCode::FORBIDDEN);
}
