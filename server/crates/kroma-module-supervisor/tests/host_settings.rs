//! The `/_host/setting` + `/_host/settings` callbacks: what a sidecar may read
//! and write of the core's settings store, by what the core declared about the key
//! and what the calling module declared about itself.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use kroma_module_host::testing::StubHost;
use kroma_module_host::{SettingReach, SettingReachOf};
use serde_json::json;
use tower::ServiceExt;

mod test_support;

use test_support::{Modules, FABRIC};

const TUNNEL: &str = "tv.kroma.tunnel";
const NOTES: &str = "tv.kroma.notes";

// `smtpPassword` is the core's own, `vpnWgConfig` goes to the module that declared
// it, and everything else is an ordinary preference.
const REACH: SettingReachOf = SettingReachOf(|key| match key {
    "smtpPassword" => SettingReach::CoreOnly,
    "vpnWgConfig" => SettingReach::Declared,
    _ => SettingReach::Any,
});

fn installed() -> Modules {
    Modules::new("host-settings")
        .declaring(
            TUNNEL,
            Some(r#"{ "read": ["vpnWgConfig"], "write": ["vpnWgConfig"] }"#),
        )
        .declaring(NOTES, Some(r#"{ "read": ["acqEnabled"] }"#))
}

async fn send(modules: &Modules, host: StubHost, req: Request<Body>) -> (StatusCode, String) {
    let res = modules
        .router::<StubHost>(REACH)
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

async fn get(modules: &Modules, host: StubHost, token: &str, uri: &str) -> (StatusCode, String) {
    let req = Request::builder()
        .method("GET")
        .uri(uri)
        .header("authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    send(modules, host, req).await
}

async fn patch(modules: &Modules, host: StubHost, token: &str, body: &str) -> (StatusCode, String) {
    let req = Request::builder()
        .method("POST")
        .uri("/_host/settings")
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    send(modules, host, req).await
}

#[tokio::test]
async fn a_setting_the_core_keeps_to_itself_answers_the_default_the_module_asked_with() {
    let modules = installed();
    let host = StubHost::new().with_setting("smtpPassword", json!("s3cr3t"));

    let (status, body) = get(
        &modules,
        host,
        &modules.token(TUNNEL),
        "/_host/setting?key=smtpPassword&kind=str&default=",
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, r#"{"value":""}"#);
    assert!(!body.contains("s3cr3t"), "the stored credential leaked");
}

#[tokio::test]
async fn a_setting_a_module_configures_still_comes_back_stored() {
    let modules = installed();
    let host = StubHost::new()
        .with_setting("acqEnabled", json!(true))
        .with_setting("namingMovieFolder", json!("{Title} ({Year})"));

    let (enabled_status, enabled) = get(
        &modules,
        host.clone(),
        &modules.token(NOTES),
        "/_host/setting?key=acqEnabled&kind=bool&default=false",
    )
    .await;
    let (folder_status, folder) = get(
        &modules,
        host,
        &modules.token(NOTES),
        "/_host/setting?key=namingMovieFolder&kind=str&default=x",
    )
    .await;

    assert_eq!(enabled_status, StatusCode::OK);
    assert_eq!(enabled, r#"{"value":true}"#);
    assert_eq!(folder_status, StatusCode::OK);
    assert_eq!(folder, r#"{"value":"{Title} ({Year})"}"#);
}

#[tokio::test]
async fn a_credential_goes_to_the_module_that_declared_it() {
    let modules = installed();
    let host = StubHost::new().with_setting("vpnWgConfig", json!("[Interface]"));

    let (status, body) = get(
        &modules,
        host,
        &modules.token(TUNNEL),
        "/_host/setting?key=vpnWgConfig&kind=str&default=",
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, r#"{"value":"[Interface]"}"#);
}

#[tokio::test]
async fn a_credential_reaches_no_other_module_whatever_it_asks() {
    let modules = installed();
    let host = StubHost::new().with_setting("vpnWgConfig", json!("[Interface]"));

    let (declared_elsewhere, by_notes) = get(
        &modules,
        host.clone(),
        &modules.token(NOTES),
        "/_host/setting?key=vpnWgConfig&kind=str&default=",
    )
    .await;
    let (unnamed, by_fabric) = get(
        &modules,
        host.clone(),
        FABRIC,
        "/_host/setting?key=vpnWgConfig&kind=str&default=",
    )
    .await;
    let (not_installed, by_stranger) = get(
        &modules,
        host,
        &modules.token("tv.kroma.never-installed"),
        "/_host/setting?key=vpnWgConfig&kind=str&default=",
    )
    .await;

    for (status, body) in [
        (declared_elsewhere, by_notes),
        (unnamed, by_fabric),
        (not_installed, by_stranger),
    ] {
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, r#"{"value":""}"#);
        assert!(!body.contains("[Interface]"), "the tunnel config leaked");
    }
}

#[tokio::test]
async fn a_module_whose_manifest_predates_the_field_keeps_its_preferences_and_loses_the_credential()
{
    let modules = Modules::new("host-settings-undeclared").declaring(NOTES, None);
    let host = StubHost::new()
        .with_setting("acqEnabled", json!(true))
        .with_setting("vpnWgConfig", json!("[Interface]"));

    let (pref_status, pref) = get(
        &modules,
        host.clone(),
        &modules.token(NOTES),
        "/_host/setting?key=acqEnabled&kind=bool&default=false",
    )
    .await;
    let (credential_status, credential) = get(
        &modules,
        host,
        &modules.token(NOTES),
        "/_host/setting?key=vpnWgConfig&kind=str&default=",
    )
    .await;

    assert_eq!(pref_status, StatusCode::OK);
    assert_eq!(pref, r#"{"value":true}"#);
    assert_eq!(credential_status, StatusCode::OK);
    assert_eq!(credential, r#"{"value":""}"#);
}

#[tokio::test]
async fn a_write_that_names_a_setting_the_core_keeps_to_itself_is_refused_whole() {
    let modules = installed();
    let host = StubHost::new();

    let (status, _) = patch(
        &modules,
        host.clone(),
        &modules.token(TUNNEL),
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
async fn a_write_to_a_credential_a_module_did_not_declare_is_refused() {
    let modules = installed();
    let host = StubHost::new();

    let (status, _) = patch(
        &modules,
        host.clone(),
        &modules.token(NOTES),
        r#"{"patch":{"vpnWgConfig":"[Interface] mine"}}"#,
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(host.settings_written().is_empty());
}

#[tokio::test]
async fn a_write_of_the_settings_a_module_owns_goes_through() {
    let modules = installed();
    let host = StubHost::new();

    let (status, _) = patch(
        &modules,
        host.clone(),
        &modules.token(TUNNEL),
        r#"{"patch":{"acqEnabled":true,"vpnWgConfig":"[Interface]"}}"#,
    )
    .await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(
        host.settings_written(),
        vec![std::collections::BTreeMap::from([
            ("acqEnabled".to_string(), json!(true)),
            ("vpnWgConfig".to_string(), json!("[Interface]")),
        ])]
    );
}

#[tokio::test]
async fn a_caller_with_no_host_token_reads_nothing_at_all() {
    let modules = installed();
    let host = StubHost::new().with_setting("acqEnabled", json!(true));
    let req = Request::builder()
        .method("GET")
        .uri("/_host/setting?key=acqEnabled&kind=bool&default=false")
        .body(Body::empty())
        .unwrap();

    let (status, _) = send(&modules, host, req).await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn a_caller_with_a_token_nobody_minted_reads_nothing_at_all() {
    let modules = installed();
    let host = StubHost::new().with_setting("acqEnabled", json!(true));

    let (status, _) = get(
        &modules,
        host,
        "a-token-of-its-own-invention",
        "/_host/setting?key=acqEnabled&kind=bool&default=false",
    )
    .await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
