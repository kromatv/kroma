//! The `/_host/setting` + `/_host/settings` callbacks: a module reads and writes
//! only the keys its manifest declares for that use, and never one the core keeps
//! to itself.

use axum::http::StatusCode;
use kroma_module_host::testing::StubHost;
use kroma_module_host::{SettingReach, SettingReachOf};
use serde_json::{Value, json};

mod test_support;

use test_support::settings::{read_setting, refusal, write_settings};
use test_support::{FABRIC, Modules};

const TUNNEL: &str = "tv.kroma.tunnel";
const NOTES: &str = "tv.kroma.notes";

const REACH: SettingReachOf = SettingReachOf(|key| match key {
    "smtpPassword" => SettingReach::CoreOnly,
    "neverHeardOf" => SettingReach::Unknown,
    _ => SettingReach::Declared,
});

fn installed() -> Modules {
    Modules::new("host-settings")
        .declaring(
            TUNNEL,
            Some(
                r#"{ "read": ["vpnWgConfig", "smtpPassword", "neverHeardOf"],
                     "write": ["vpnWgConfig", "smtpPassword"] }"#,
            ),
        )
        .declaring(NOTES, Some(r#"{ "read": ["acqEnabled"] }"#))
}

async fn read(modules: &Modules, host: StubHost, token: &str, key: &str) -> (StatusCode, String) {
    read_setting(modules, REACH, host, token, key).await
}

async fn patch(
    modules: &Modules,
    host: StubHost,
    token: &str,
    body: Value,
) -> (StatusCode, String) {
    write_settings(modules, REACH, host, token, body).await
}

#[tokio::test]
async fn a_declared_setting_comes_back_stored() {
    let modules = installed();
    let host = StubHost::new().with_setting("acqEnabled", json!("yes"));

    let (status, body) = read(&modules, host, &modules.token(NOTES), "acqEnabled").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, r#"{"value":"yes"}"#);
}

#[tokio::test]
async fn reading_a_setting_the_manifest_does_not_declare_is_refused_naming_what_to_declare() {
    let modules = installed();
    let host = StubHost::new().with_setting("namingMovieFolder", json!("{Title}"));

    let (status, body) = read(&modules, host, &modules.token(NOTES), "namingMovieFolder").await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(
        refusal(&body),
        r#"settings.read: "namingMovieFolder" is not declared; add it to settings.read in module.json"#
    );
    assert!(!body.contains("{Title}"), "the stored value leaked");
}

#[tokio::test]
async fn writing_a_setting_the_manifest_does_not_declare_is_refused_naming_what_to_declare() {
    let modules = installed();
    let host = StubHost::new();

    let (status, body) = patch(
        &modules,
        host.clone(),
        &modules.token(NOTES),
        json!({ "acqEnabled": true }),
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(
        refusal(&body),
        r#"settings.write: "acqEnabled" is not declared; add it to settings.write in module.json"#,
        "a read declaration is not a write declaration"
    );
    assert!(host.settings_written().is_empty());
}

#[tokio::test]
async fn a_patch_naming_one_undeclared_setting_is_refused_whole() {
    let modules = installed();
    let host = StubHost::new();

    let (status, body) = patch(
        &modules,
        host.clone(),
        &modules.token(TUNNEL),
        json!({ "vpnWgConfig": "[Interface]", "rqbitDownKbps": 1 }),
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(refusal(&body).contains(r#""rqbitDownKbps" is not declared"#));
    assert!(
        host.settings_written().is_empty(),
        "a refused patch writes none of its keys"
    );
}

#[tokio::test]
async fn a_write_of_the_settings_a_module_declared_goes_through() {
    let modules = installed();
    let host = StubHost::new();

    let (status, _) = patch(
        &modules,
        host.clone(),
        &modules.token(TUNNEL),
        json!({ "vpnWgConfig": "[Interface]" }),
    )
    .await;

    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(
        host.settings_written(),
        vec![std::collections::BTreeMap::from([(
            "vpnWgConfig".to_string(),
            json!("[Interface]")
        )])]
    );
}

#[tokio::test]
async fn a_setting_the_core_keeps_to_itself_is_refused_even_to_a_module_that_declares_it() {
    let modules = installed();
    let host = StubHost::new().with_setting("smtpPassword", json!("s3cr3t"));

    let (read_status, read_body) = read(
        &modules,
        host.clone(),
        &modules.token(TUNNEL),
        "smtpPassword",
    )
    .await;
    let (write_status, write_body) = patch(
        &modules,
        host.clone(),
        &modules.token(TUNNEL),
        json!({ "smtpPassword": "mine now" }),
    )
    .await;

    assert_eq!(read_status, StatusCode::FORBIDDEN);
    assert_eq!(
        refusal(&read_body),
        r#"settings.read: "smtpPassword" is the core's own and reaches no module, declared or not"#
    );
    assert!(
        !read_body.contains("s3cr3t"),
        "the stored credential leaked"
    );
    assert_eq!(write_status, StatusCode::FORBIDDEN);
    assert!(
        refusal(&write_body).starts_with(r#"settings.write: "smtpPassword" is the core's own"#)
    );
    assert!(host.settings_written().is_empty());
}

#[tokio::test]
async fn a_key_the_core_does_not_have_is_refused_as_such() {
    let modules = installed();

    let (status, body) = read(
        &modules,
        StubHost::new(),
        &modules.token(TUNNEL),
        "neverHeardOf",
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(
        refusal(&body),
        r#"settings.read: "neverHeardOf" is not a setting of this server"#
    );
}

#[tokio::test]
async fn a_module_that_declares_no_settings_reaches_none() {
    let modules = Modules::new("host-settings-undeclared").declaring(NOTES, None);
    let host = StubHost::new().with_setting("acqEnabled", json!("yes"));

    let (read_status, read_body) =
        read(&modules, host.clone(), &modules.token(NOTES), "acqEnabled").await;
    let (write_status, _) = patch(
        &modules,
        host.clone(),
        &modules.token(NOTES),
        json!({ "acqEnabled": "no" }),
    )
    .await;

    assert_eq!(read_status, StatusCode::FORBIDDEN);
    assert!(refusal(&read_body).contains("add it to settings.read in module.json"));
    assert_eq!(write_status, StatusCode::FORBIDDEN);
    assert!(host.settings_written().is_empty());
}

#[tokio::test]
async fn a_caller_the_callback_cannot_name_reaches_no_setting() {
    let modules = installed();
    let host = StubHost::new().with_setting("vpnWgConfig", json!("[Interface]"));

    let (unnamed, by_fabric) = read(&modules, host.clone(), FABRIC, "vpnWgConfig").await;
    let (stranger, by_stranger) = read(
        &modules,
        host,
        &modules.token("tv.kroma.never-installed"),
        "vpnWgConfig",
    )
    .await;

    for (status, body) in [(unnamed, by_fabric), (stranger, by_stranger)] {
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(!body.contains("[Interface]"), "the tunnel config leaked");
    }
}

#[tokio::test]
async fn a_refusal_is_written_on_the_modules_own_log() {
    let modules = installed();

    read(
        &modules,
        StubHost::new(),
        &modules.token(NOTES),
        "namingMovieFolder",
    )
    .await;

    assert_eq!(
        *modules.said.lock().unwrap(),
        vec![format!(
            r#"{NOTES}: WARN settings.read: "namingMovieFolder" is not declared; add it to settings.read in module.json"#
        )]
    );
}

#[tokio::test]
async fn a_caller_with_no_host_token_reads_nothing_at_all() {
    let modules = installed();

    let (status, _) = modules
        .get(
            StubHost::new(),
            "/_host/setting?key=acqEnabled&kind=bool&default=false",
            None,
        )
        .await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn a_caller_with_a_token_nobody_minted_reads_nothing_at_all() {
    let modules = installed();

    let (status, _) = read(
        &modules,
        StubHost::new(),
        "a-token-of-its-own-invention",
        "acqEnabled",
    )
    .await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
