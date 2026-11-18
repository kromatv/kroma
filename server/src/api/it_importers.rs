use axum::http::StatusCode;
use kroma_engine::services::importers::POINT;
use serde_json::{Value, json};

use crate::api::test_support::{
    IMPORTER, get, importer_answering, installed_module, point_store_at, registry_serving,
    seed_session, send, test_app,
};

const NOWHERE: &str = "http://127.0.0.1:1/registry.json";
const FORM: &str = r#", "contributes": [{
    "point": "importer",
    "label": "Other server",
    "fields": [
        { "key": "url", "label": "field.url", "type": "string", "required": true },
        { "key": "password", "label": "field.password", "type": "string", "secret": true }
    ]
}]"#;

fn offered(id: &str, point: &str) -> Value {
    json!({
        "schemaVersion": 3,
        "id": id,
        "name": "Reader",
        "version": "1.0.0",
        "icon": "data:image/svg+xml;base64,PHN2Zy8+",
        "contributes": [{
            "point": point,
            "label": "Another server",
            "fields": [{ "key": "token", "label": "field.token", "type": "string", "secret": true }],
        }],
        "artifacts": [{ "target": null, "url": "https://x/reader.kmod", "size": 3, "sha256": "aa" }],
    })
}

#[tokio::test]
async fn an_installed_importer_is_listed_with_the_form_of_its_sign_in() {
    let (t, _) = importer_answering(json!(null));
    installed_module(&t, IMPORTER, FORM);
    point_store_at(&t, &registry_serving(json!([]), &[]).await);

    let (status, body) = get(&t.app, "/api/admin/importers", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        json!({ "importers": [{
            "id": IMPORTER,
            "name": "Stub",
            "label": "Other server",
            "installed": true,
            "running": true,
            "fields": [
                {
                    "key": "url", "label": "field.url", "type": "string", "default": null,
                    "options": [], "secret": false, "required": true,
                },
                {
                    "key": "password", "label": "field.password", "type": "string", "default": null,
                    "options": [], "secret": true, "required": false,
                },
            ],
        }]})
    );
}

#[tokio::test]
async fn an_installed_importer_that_is_not_answering_is_listed_as_not_running() {
    let t = test_app();
    installed_module(&t, IMPORTER, FORM);
    point_store_at(&t, &registry_serving(json!([]), &[]).await);

    let (_, body) = get(&t.app, "/api/admin/importers", Some(&t.token)).await;

    assert_eq!(body["importers"][0]["installed"], json!(true));
    assert_eq!(body["importers"][0]["running"], json!(false));
}

#[tokio::test]
async fn the_official_registry_adds_the_importers_this_server_does_not_have() {
    let t = test_app();
    installed_module(&t, IMPORTER, FORM);
    let index = json!([
        offered(IMPORTER, POINT),
        offered("tv.x.reader", POINT),
        offered("tv.x.engine", "tv.x.manager/client"),
    ]);
    point_store_at(&t, &registry_serving(index, &[]).await);

    let (_, body) = get(&t.app, "/api/admin/importers", Some(&t.token)).await;

    let ids: Vec<&str> = body["importers"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|row| row["id"].as_str())
        .collect();
    assert_eq!(ids, vec![IMPORTER, "tv.x.reader"]);
    assert_eq!(
        body["importers"][1],
        json!({
            "id": "tv.x.reader",
            "name": "Reader",
            "label": "Another server",
            "icon": "data:image/svg+xml;base64,PHN2Zy8+",
            "installed": false,
            "running": false,
            "fields": [{
                "key": "token", "label": "field.token", "type": "string", "default": null,
                "options": [], "secret": true, "required": false,
            }],
        })
    );
    assert!(body.get("registryError").is_none());
}

#[tokio::test]
async fn a_registry_that_cannot_be_read_leaves_the_installed_importers_and_says_why() {
    let t = test_app();
    installed_module(&t, IMPORTER, FORM);
    point_store_at(&t, NOWHERE);

    let (status, body) = get(&t.app, "/api/admin/importers", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["importers"].as_array().unwrap().len(), 1);
    assert!(body["registryError"].is_string());
}

#[tokio::test]
async fn the_importers_are_for_whoever_manages_settings() {
    let (t, sent) = importer_answering(json!({ "Ok": { "status": "ready", "signIn": "s-1" } }));
    let (_, member) = seed_session(&t.state, "ana@test.dev", "ana", &[]);
    let connect = format!("/api/admin/importers/{IMPORTER}/connect");

    let (listed, _) = get(&t.app, "/api/admin/importers", Some(&member)).await;
    let (connected, _) = send(&t.app, "POST", &connect, Some(&member), Some(json!({}))).await;
    let (anonymous, _) = send(&t.app, "POST", &connect, None, Some(json!({}))).await;

    assert_eq!(listed, StatusCode::FORBIDDEN);
    assert_eq!(connected, StatusCode::FORBIDDEN);
    assert_eq!(anonymous, StatusCode::UNAUTHORIZED);
    assert!(sent.lock().unwrap().is_empty());
}
