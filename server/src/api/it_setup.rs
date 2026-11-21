use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::api::test_support::{
    PASSWORD, TestApp, get, installed_module, seed_library, seed_session, send, test_app,
};
use crate::db;
use crate::model::Permission;

const FUTURE: i64 = 9_999_999_999;

async fn new_owner(t: &TestApp) -> String {
    t.state
        .db
        .get()
        .unwrap()
        .execute("DELETE FROM users", [])
        .unwrap();
    let body = json!({ "email": "owner@test.dev", "username": "owner", "password": PASSWORD });
    let (_, answer) = send(&t.app, "POST", "/api/auth/register", None, Some(body)).await;
    answer["token"].as_str().unwrap().to_string()
}

async fn setup_of(t: &TestApp, token: &str) -> Value {
    get(&t.app, "/api/admin/setup", Some(token)).await.1["setup"].clone()
}

async fn advance(t: &TestApp, token: &str, step: &str, start: &str) -> StatusCode {
    let body = json!({ "step": step, "start": start });
    send(&t.app, "PUT", "/api/admin/setup", Some(token), Some(body))
        .await
        .0
}

async fn post(t: &TestApp, token: &str, path: &str) -> StatusCode {
    send(&t.app, "POST", path, Some(token), None).await.0
}

async fn ended_early(t: &TestApp, start: &str) -> String {
    let token = new_owner(t).await;
    advance(t, &token, "media", start).await;
    post(t, &token, "/api/admin/setup/end").await;
    token
}

fn the_owner(t: &TestApp) -> String {
    let conn = t.state.db.get().unwrap();
    conn.query_row("SELECT id FROM users", [], |row| row.get(0))
        .unwrap()
}

fn checklist(setup: &Value) -> Vec<&str> {
    setup["checklist"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(Value::as_str)
        .collect()
}

#[tokio::test]
async fn a_server_that_had_its_owner_before_the_setup_reports_none() {
    let t = test_app();

    let setup = setup_of(&t, &t.token).await;

    assert_eq!(setup, Value::Null);
}

#[tokio::test]
async fn the_owner_resumes_on_another_browser_at_the_step_they_left() {
    let t = test_app();
    let token = new_owner(&t).await;
    advance(&t, &token, "people", "bring").await;

    let setup = setup_of(&t, &token).await;

    assert_eq!(setup["step"], "people");
    assert_eq!(setup["start"], "bring");
    assert_eq!(setup["ended"], false);
}

#[tokio::test]
async fn going_back_keeps_the_furthest_step_reached() {
    let t = test_app();
    let token = new_owner(&t).await;
    advance(&t, &token, "people", "fresh").await;

    advance(&t, &token, "media", "fresh").await;

    let setup = setup_of(&t, &token).await;
    assert_eq!(setup["step"], "media");
    assert_eq!(setup["reached"], "people");
}

#[tokio::test]
async fn nobody_but_the_owner_reads_the_setup() {
    let t = test_app();
    new_owner(&t).await;
    let (_, admin) = seed_session(&t.state, "admin@test.dev", "admin", &Permission::all());

    let setup = setup_of(&t, &admin).await;

    assert_eq!(setup, Value::Null);
}

#[tokio::test]
async fn nobody_but_the_owner_advances_the_setup() {
    let t = test_app();
    new_owner(&t).await;
    let (_, admin) = seed_session(&t.state, "admin@test.dev", "admin", &Permission::all());

    let status = advance(&t, &admin, "done", "fresh").await;

    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn a_step_the_setup_does_not_have_is_refused() {
    let t = test_app();
    let token = new_owner(&t).await;

    let status = advance(&t, &token, "devices", "fresh").await;

    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn a_running_setup_leaves_no_checklist() {
    let t = test_app();
    let token = new_owner(&t).await;
    advance(&t, &token, "media", "fresh").await;

    let setup = setup_of(&t, &token).await;

    assert!(checklist(&setup).is_empty());
}

#[tokio::test]
async fn an_ended_setup_lists_every_step_not_done() {
    let t = test_app();
    let token = ended_early(&t, "fresh").await;

    let setup = setup_of(&t, &token).await;

    assert_eq!(checklist(&setup), ["media", "modules", "people", "privacy"]);
}

#[tokio::test]
async fn the_import_line_is_only_for_an_owner_who_chose_to_bring_a_server_over() {
    let t = test_app();
    let token = ended_early(&t, "bring").await;

    let setup = setup_of(&t, &token).await;

    assert_eq!(checklist(&setup)[0], "import");
}

#[tokio::test]
async fn a_source_added_under_admin_marks_the_media_step_done() {
    let t = test_app();
    let token = ended_early(&t, "fresh").await;

    seed_library(&t.state, "Films");

    let setup = setup_of(&t, &token).await;
    assert!(!checklist(&setup).contains(&"media"));
}

#[tokio::test]
async fn an_invitation_marks_the_people_step_done() {
    let t = test_app();
    let token = ended_early(&t, "fresh").await;

    db::create_invite(
        &t.state.db,
        "a-link",
        &[Permission::Playback],
        &the_owner(&t),
        FUTURE,
    )
    .unwrap();

    let setup = setup_of(&t, &token).await;
    assert!(!checklist(&setup).contains(&"people"));
}

#[tokio::test]
async fn confirming_the_statistics_step_marks_it_done() {
    let t = test_app();
    let token = ended_early(&t, "fresh").await;

    post(&t, &token, "/api/admin/setup/confirm/privacy").await;

    let setup = setup_of(&t, &token).await;
    assert!(!checklist(&setup).contains(&"privacy"));
}

#[tokio::test]
async fn only_a_step_the_owner_answers_without_a_trace_is_confirmed() {
    let t = test_app();
    let token = new_owner(&t).await;

    let status = post(&t, &token, "/api/admin/setup/confirm/media").await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_dismissed_line_does_not_come_back() {
    let t = test_app();
    let token = ended_early(&t, "fresh").await;

    post(&t, &token, "/api/admin/setup/dismiss/people").await;

    let setup = setup_of(&t, &token).await;
    assert!(!checklist(&setup).contains(&"people"));
}

#[tokio::test]
async fn a_step_once_done_stays_done_when_its_result_goes() {
    let t = test_app();
    let token = ended_early(&t, "fresh").await;
    seed_library(&t.state, "Films");
    setup_of(&t, &token).await;

    crate::services::settings::set_library_defs(&t.state.settings, &t.state.db, &[]);

    let setup = setup_of(&t, &token).await;
    assert!(!checklist(&setup).contains(&"media"));
}

#[tokio::test]
async fn an_installed_module_marks_the_modules_step_done() {
    let t = test_app();
    installed_module(&t, "tv.example.discovery", "");

    let token = ended_early(&t, "fresh").await;

    let setup = setup_of(&t, &token).await;
    assert!(!checklist(&setup).contains(&"modules"));
}

#[tokio::test]
async fn the_importer_the_import_step_installed_leaves_the_modules_line() {
    let t = test_app();
    installed_module(
        &t,
        "tv.example.import",
        r#", "contributes": [{ "point": "importer" }]"#,
    );

    let token = ended_early(&t, "bring").await;

    let setup = setup_of(&t, &token).await;
    assert!(checklist(&setup).contains(&"modules"));
}

#[tokio::test]
async fn a_visitor_who_is_not_signed_in_reads_no_setup() {
    let t = test_app();

    let (status, _) = get(&t.app, "/api/admin/setup", None).await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
