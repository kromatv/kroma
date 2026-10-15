use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::json;

use crate::api::test_support::{seed_session, send, test_app, TestApp};
use crate::model::Permission;

const SIDECAR: &str = "tv.kroma.sidecar";

// A published SDK's strict parse, kept strict on purpose: one key it cannot
// name fails the whole answer and the module reads a live session as none.
#[derive(Deserialize)]
struct SdkUser {
    permissions: Vec<SdkRight>,
}

#[derive(Debug, Deserialize, PartialEq)]
enum SdkRight {
    #[serde(rename = "users.manage")]
    UsersManage,
    #[serde(rename = "library.manage")]
    LibraryManage,
    #[serde(rename = "settings.manage")]
    SettingsManage,
    #[serde(rename = "playback")]
    Playback,
    #[serde(rename = "requests.create")]
    RequestsCreate,
    #[serde(rename = "requests.manage")]
    RequestsManage,
    #[serde(rename = "requests.auto")]
    RequestsAuto,
    #[serde(rename = "reports.manage")]
    ReportsManage,
}

fn sidecar_declaring(t: &TestApp, rights: &str) -> String {
    let dir = t.state.config.data_dir.join("modules").join(SIDECAR);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("module.json"),
        format!(
            r#"{{ "schemaVersion": {}, "id": "{SIDECAR}", "name": "Sidecar", "version": "1.0.0",
                  "rights": {rights} }}"#,
            kroma_module_manifest::MODULE_SCHEMA_VERSION,
        ),
    )
    .unwrap();
    t.supervisor.module_token(SIDECAR)
}

async fn session_asked_for(t: &TestApp, module_token: &str, session: &str) -> serde_json::Value {
    let (status, answer) = send(
        &t.app,
        "POST",
        "/api/_host/session",
        Some(module_token),
        Some(json!({ "token": session })),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    answer
}

#[tokio::test]
async fn a_module_that_asks_for_no_right_is_answered_a_session_its_build_can_parse() {
    let t = test_app();
    let module_token = sidecar_declaring(&t, "[]");
    let (_, session) = seed_session(&t.state, "ana@t.dev", "ana", &Permission::all());

    let answer = session_asked_for(&t, &module_token, &session).await;

    let read: SdkUser = serde_json::from_value(answer).expect("a session an older build reads");
    assert!(read.permissions.contains(&SdkRight::Playback));
    assert!(read.permissions.contains(&SdkRight::UsersManage));
}

#[tokio::test]
async fn a_module_that_asks_for_a_right_is_answered_it() {
    let t = test_app();
    let module_token = sidecar_declaring(&t, r#"["watchable.play"]"#);
    let (_, session) = seed_session(&t.state, "ana@t.dev", "ana", &Permission::all());

    let answer = session_asked_for(&t, &module_token, &session).await;

    assert!(
        answer["permissions"]
            .as_array()
            .expect("the rights")
            .contains(&json!("watchable.play"))
    );
}

#[tokio::test]
async fn a_right_the_account_does_not_hold_is_absent_however_loudly_a_module_asks() {
    let t = test_app();
    let module_token = sidecar_declaring(&t, r#"["watchable.play"]"#);
    let (_, session) = seed_session(&t.state, "ed@t.dev", "ed", &[Permission::Playback]);

    let answer = session_asked_for(&t, &module_token, &session).await;

    assert_eq!(answer["permissions"], json!(["playback"]));
}

#[tokio::test]
async fn a_caller_the_callback_cannot_name_is_answered_the_rights_every_build_knows() {
    let t = test_app();
    let (_, session) = seed_session(&t.state, "ana@t.dev", "ana", &Permission::all());

    let answer = session_asked_for(&t, "test-host-token", &session).await;

    let read: SdkUser = serde_json::from_value(answer).expect("a session an older build reads");
    assert!(read.permissions.contains(&SdkRight::Playback));
}
