//! The `/_host/setting` + `/_host/settings` callbacks: what a sidecar may read
//! and write of the core's settings store.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use kroma_module_host::testing::StubHost;
use kroma_module_supervisor::WithheldSettings;
use serde_json::json;
use tower::ServiceExt;

const TOKEN: &str = "host-token";
const WITHHELD: WithheldSettings = WithheldSettings(|key| key == "smtpPassword");

async fn send(host: StubHost, req: Request<Body>) -> (StatusCode, String) {
    let res = kroma_module_supervisor::host_router::<StubHost>(TOKEN.into(), WITHHELD)
        .with_state(host)
        .oneshot(req)
        .await
        .unwrap();
    let status = res.status();
    let bytes = axum::body::to_bytes(res.into_body(), 64 * 1024)
        .await
        .unwrap();
    (status, String::from_utf8(bytes.to_vec()).unwrap())
}

async fn get(host: StubHost, uri: &str) -> (StatusCode, String) {
    let req = Request::builder()
        .method("GET")
        .uri(uri)
        .header("authorization", format!("Bearer {TOKEN}"))
        .body(Body::empty())
        .unwrap();
    send(host, req).await
}

async fn patch(host: StubHost, body: &str) -> (StatusCode, String) {
    let req = Request::builder()
        .method("POST")
        .uri("/_host/settings")
        .header("authorization", format!("Bearer {TOKEN}"))
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    send(host, req).await
}

#[tokio::test]
async fn a_setting_the_core_keeps_to_itself_answers_the_default_the_module_asked_with() {
    let host = StubHost::new().with_setting("smtpPassword", json!("s3cr3t"));

    let (status, body) = get(host, "/_host/setting?key=smtpPassword&kind=str&default=").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, r#"{"value":""}"#);
    assert!(!body.contains("s3cr3t"), "the stored credential leaked");
}

#[tokio::test]
async fn a_setting_a_module_configures_still_comes_back_stored() {
    let host = StubHost::new()
        .with_setting("acqEnabled", json!(true))
        .with_setting("namingMovieFolder", json!("{Title} ({Year})"));

    let (enabled_status, enabled) = get(
        host.clone(),
        "/_host/setting?key=acqEnabled&kind=bool&default=false",
    )
    .await;
    let (folder_status, folder) = get(
        host,
        "/_host/setting?key=namingMovieFolder&kind=str&default=x",
    )
    .await;

    assert_eq!(enabled_status, StatusCode::OK);
    assert_eq!(enabled, r#"{"value":true}"#);
    assert_eq!(folder_status, StatusCode::OK);
    assert_eq!(folder, r#"{"value":"{Title} ({Year})"}"#);
}

#[tokio::test]
async fn a_write_that_names_a_setting_the_core_keeps_to_itself_is_refused_whole() {
    let host = StubHost::new();

    let (status, _) = patch(
        host.clone(),
        r#"{"patch":{"acqEnabled":true,"smtpPassword":"mine now"}}"#,
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(
        host.settings_written().is_empty(),
        "a refused patch must write none of its keys"
    );
}

#[tokio::test]
async fn a_write_of_the_settings_a_module_owns_goes_through() {
    let host = StubHost::new();

    let (status, _) = patch(host.clone(), r#"{"patch":{"acqEnabled":true}}"#).await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(
        host.settings_written(),
        vec![std::collections::BTreeMap::from([(
            "acqEnabled".to_string(),
            json!(true)
        )])]
    );
}

#[tokio::test]
async fn a_caller_with_no_host_token_reads_nothing_at_all() {
    let host = StubHost::new().with_setting("acqEnabled", json!(true));
    let req = Request::builder()
        .method("GET")
        .uri("/_host/setting?key=acqEnabled&kind=bool&default=false")
        .body(Body::empty())
        .unwrap();

    let (status, _) = send(host, req).await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
