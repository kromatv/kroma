use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{get, seed_session, send, test_app, TestApp};
use crate::model::{Audience, NotificationEvent, NotificationSpec, Permission};

const HOST_TOKEN: &str = "test-host-token";
const MODULE: &str = "tv.kroma.torrents";
const COMPLETED: &str = "tv.kroma.torrents/download.completed";

fn install_declaring_module(t: &TestApp) -> String {
    let dir = t.state.config.data_dir.join("modules").join(MODULE);
    std::fs::create_dir_all(dir.join("locales")).unwrap();
    std::fs::write(
        dir.join("module.json"),
        json!({
            "schemaVersion": kroma_module_manifest::MODULE_SCHEMA_VERSION,
            "id": MODULE, "name": "Torrents", "version": "1.0.0",
            "notifications": [{
                "type": COMPLETED, "category": "downloads", "push": false,
                "titleKey": "notifications.completed.title",
                "bodyKey": "notifications.completed.body",
                "labelKey": "notifications.completed.label",
            }],
        })
        .to_string(),
    )
    .unwrap();
    for (code, title, label) in [
        ("en", "Download finished", "Finished downloads"),
        ("fr", "Téléchargement terminé", "Téléchargements terminés"),
    ] {
        std::fs::write(
            dir.join("locales").join(format!("{code}.json")),
            json!({
                "notifications.completed.title": title,
                "notifications.completed.body": "{title}",
                "notifications.completed.label": label,
            })
            .to_string(),
        )
        .unwrap();
    }
    t.supervisor.module_token(MODULE)
}

fn admin(t: &TestApp, tag: &str) -> (String, String) {
    seed_session(
        &t.state,
        &format!("{tag}@test.dev"),
        tag,
        &[Permission::SettingsManage],
    )
}

fn kind<'a>(prefs: &'a Value, name: &str) -> &'a Value {
    prefs["types"]
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["type"] == json!(name))
        .unwrap_or_else(|| panic!("{name} is not listed: {prefs}"))
}

fn announce(declared: &str) -> Value {
    json!({
        "audience": { "kind": "everyone" },
        "spec": { "event": "custom", "type": declared, "params": { "title": "Dune.2021" } },
    })
}

#[tokio::test]
async fn a_reader_who_mutes_failed_jobs_in_settings_still_hears_that_the_disk_is_low() {
    let t = test_app();
    let (ana_id, ana) = admin(&t, "ana");
    let (status, _) = send(
        &t.app,
        "PUT",
        "/api/notifications/prefs",
        Some(&ana),
        Some(json!({ "types": [{ "type": "system.job.failed", "inApp": false, "push": false }] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let failed = NotificationSpec::new(
        NotificationEvent::SystemJobFailed,
        "notifications.system.job.failed.title",
        "notifications.system.job.failed.body",
    )
    .param_key("job", "jobs.library.scan.name");
    let low = NotificationSpec::new(
        NotificationEvent::SystemDiskLow,
        "notifications.system.disk.low.title",
        "notifications.system.disk.low.body",
    )
    .param("free", "2 GB")
    .param("path", "/media");

    let told_failed = crate::services::notify::emit(&t.state, &Audience::user(&ana_id), &failed);
    let told_low = crate::services::notify::emit(&t.state, &Audience::user(&ana_id), &low);

    assert_eq!((told_failed, told_low), (0, 1));
    let (_, inbox) = get(&t.app, "/api/notifications", Some(&ana)).await;
    let events: Vec<&Value> = inbox["notifications"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| &n["event"])
        .collect();
    assert_eq!(events, [&json!("system.disk.low")]);
}

#[tokio::test]
async fn the_matrix_lists_every_kind_under_its_category_in_the_readers_language() {
    let t = test_app();
    install_declaring_module(&t);
    let (_, ana) = admin(&t, "ana");

    let (status, prefs) = get(&t.app, "/api/notifications/prefs", Some(&ana)).await;

    assert_eq!(status, StatusCode::OK);
    let job = kind(&prefs, "system.job.failed");
    assert_eq!(job["category"], json!("system"));
    assert_eq!(job["label"], json!("Tâche en échec"));
    let completed = kind(&prefs, COMPLETED);
    assert_eq!(completed["category"], json!("downloads"));
    assert_eq!(completed["label"], json!("Téléchargements terminés"));
    assert_eq!(completed["inApp"], json!(true));
    assert_eq!(completed["push"], json!(false));
}

#[tokio::test]
async fn a_client_that_sends_categories_alone_keeps_the_readers_type_choices() {
    let t = test_app();
    let (_, ana) = admin(&t, "ana");
    send(
        &t.app,
        "PUT",
        "/api/notifications/prefs",
        Some(&ana),
        Some(json!({ "types": [{ "type": "system.job.failed", "inApp": true, "push": false }] })),
    )
    .await;

    let (status, prefs) = send(
        &t.app,
        "PUT",
        "/api/notifications/prefs",
        Some(&ana),
        Some(json!({ "categories": [{ "category": "media", "inApp": false, "push": false }] })),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(kind(&prefs, "system.job.failed")["push"], json!(false));
    assert_eq!(kind(&prefs, "media.added")["inApp"], json!(false));
}

#[tokio::test]
async fn a_type_a_module_declared_reaches_its_reader_in_their_own_language() {
    let t = test_app();
    let token = install_declaring_module(&t);
    let (_, ana) = admin(&t, "ana");

    let (status, body) = send(
        &t.seam,
        "POST",
        "/api/_host/notify",
        Some(&token),
        Some(announce(COMPLETED)),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert!(body["sent"].as_u64().unwrap() >= 1, "{body}");
    let (_, inbox) = get(&t.app, "/api/notifications", Some(&ana)).await;
    let row = &inbox["notifications"][0];
    assert_eq!(row["title"], json!("Téléchargement terminé"));
    assert_eq!(row["body"], json!("Dune.2021"));
    assert_eq!(row["category"], json!("downloads"));
}

#[tokio::test]
async fn a_type_the_calling_module_did_not_declare_is_refused_by_name() {
    let t = test_app();
    let token = install_declaring_module(&t);

    let (status, body) = send(
        &t.seam,
        "POST",
        "/api/_host/notify",
        Some(&token),
        Some(announce("tv.kroma.torrents/download.vanished")),
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    let refusal = body["error"].as_str().unwrap();
    assert!(
        refusal.contains("tv.kroma.torrents/download.vanished"),
        "{refusal}"
    );
    assert!(refusal.contains("module.json"), "{refusal}");
}

#[tokio::test]
async fn a_caller_no_token_names_cannot_send_a_declared_type() {
    let t = test_app();
    install_declaring_module(&t);

    let (status, _) = send(
        &t.seam,
        "POST",
        "/api/_host/notify",
        Some(HOST_TOKEN),
        Some(announce(COMPLETED)),
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn a_module_built_before_declared_types_still_sends_its_own_words() {
    let t = test_app();
    let token = install_declaring_module(&t);
    let (_, ana) = admin(&t, "ana");
    let custom = json!({
        "audience": { "kind": "everyone" },
        "spec": {
            "event": "custom", "category": "downloads",
            "titleKey": "notifications.custom.title", "bodyKey": "notifications.custom.body",
            "params": { "title": "Fini", "body": "Dune" },
        },
    });

    let (status, _) = send(
        &t.seam,
        "POST",
        "/api/_host/notify",
        Some(&token),
        Some(custom),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let (_, inbox) = get(&t.app, "/api/notifications", Some(&ana)).await;
    assert_eq!(inbox["notifications"][0]["title"], json!("Fini"));
}
