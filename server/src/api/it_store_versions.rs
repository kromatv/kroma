use axum::http::StatusCode;
use serde_json::{json, Value};

use crate::api::test_support::{get, send, test_app, text, TestApp};

fn version(server: &str, file: &str) -> Value {
    json!({
        "schemaVersion": 3,
        "engines": { "server": server },
        "artifacts": [{ "target": null, "url": format!("https://x/{file}.kmod"), "size": 3, "sha256": "aa" }],
    })
}

fn newest() -> Value {
    json!({
        "schemaVersion": 3, "id": "tv.kroma.vpn", "name": "VPN", "version": "2.0.0",
        "engines": { "server": ">=999.0.0" },
        "artifacts": [{ "target": null, "url": "https://x/2.kmod", "size": 3, "sha256": "aa" }],
    })
}

async fn spawn_registry(index: Value, record: Option<Value>) -> String {
    let serve = |body: Value| {
        axum::routing::get(move || {
            let body = body.clone();
            async move { axum::Json(body) }
        })
    };
    let descriptor = json!({ "apiVersion": 1, "name": "Test", "url": "https://test", "modules": ["tv.kroma.vpn"] });
    let mut app = axum::Router::new()
        .route("/registry.json", serve(descriptor))
        .route("/index.json", serve(index));
    if let Some(record) = record {
        app = app.route("/m/tv.kroma.vpn.json", serve(record));
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    format!("http://{addr}/registry.json")
}

fn record() -> Value {
    json!({
        "apiVersion": 1, "id": "tv.kroma.vpn", "name": "VPN", "latest": "2.0.0",
        "versions": {
            "2.0.0": version(">=999.0.0", "2"),
            "1.4.0": version(">=0.0.1", "1.4"),
            "1.3.0": version(">=0.0.1", "1.3"),
        },
    })
}

fn point_store_at(t: &TestApp, url: &str) {
    t.state.settings.set_patch(
        &t.state.db,
        [("moduleRegistryUrl".to_string(), json!(url))]
            .into_iter()
            .collect(),
    );
}

async fn catalog_row(t: &TestApp) -> Value {
    let (_, body) = get(&t.app, "/api/admin/store/catalog", Some(&t.token)).await;
    body["modules"][0].clone()
}

#[tokio::test]
async fn the_store_offers_the_newest_version_this_server_runs() {
    let t = test_app();
    point_store_at(&t, &spawn_registry(json!([newest()]), Some(record())).await);

    let row = catalog_row(&t).await;

    assert_eq!(row["version"], json!("1.4.0"));
    assert_eq!(row["compatible"], json!(true));
    assert_eq!(row["url"], json!("https://x/1.4.kmod"));
}

#[tokio::test]
async fn the_store_names_the_newest_version_and_what_it_needs() {
    let t = test_app();
    point_store_at(&t, &spawn_registry(json!([newest()]), Some(record())).await);

    let row = catalog_row(&t).await;

    assert_eq!(row["newest"]["version"], json!("2.0.0"));
    assert_eq!(row["newest"]["refusal"]["kind"], json!("engine"));
    assert_eq!(row["newest"]["refusal"]["range"], json!(">=999.0.0"));
}

#[tokio::test]
async fn the_store_keeps_refusing_the_newest_when_the_registry_has_no_record() {
    let t = test_app();
    point_store_at(&t, &spawn_registry(json!([newest()]), None).await);

    let row = catalog_row(&t).await;

    assert_eq!(row["version"], json!("2.0.0"));
    assert_eq!(row["compatible"], json!(false));
    assert!(row["newest"].is_null());
}

#[tokio::test]
async fn an_install_plan_takes_the_version_this_server_runs() {
    let t = test_app();
    point_store_at(&t, &spawn_registry(json!([newest()]), Some(record())).await);

    let (status, body) = send(
        &t.app,
        "POST",
        "/api/admin/store/plan",
        Some(&t.token),
        Some(json!({ "id": "tv.kroma.vpn" })),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["modules"][0]["version"], json!("1.4.0"));
}

#[tokio::test]
async fn a_dependant_whose_range_misses_the_runnable_version_is_refused_naming_both() {
    let t = test_app();
    let app = json!({
        "schemaVersion": 3, "id": "tv.kroma.app", "name": "App", "version": "1.0.0",
        "dependencies": { "tv.kroma.vpn": "^2.0.0" },
        "artifacts": [{ "target": null, "url": "https://x/app.kmod", "size": 3, "sha256": "aa" }],
    });
    point_store_at(
        &t,
        &spawn_registry(json!([newest(), app]), Some(record())).await,
    );

    let (status, message) = text(
        &t.app,
        "POST",
        "/api/admin/store/plan",
        Some(&t.token),
        Some(json!({ "id": "tv.kroma.app" })),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(
        message,
        "'tv.kroma.app' needs tv.kroma.vpn@^2.0.0 but the newest version this server runs is 1.4.0"
    );
}
