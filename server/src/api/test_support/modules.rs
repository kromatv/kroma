use std::collections::BTreeMap;

use axum::http::StatusCode;
use serde_json::{Value, json};

use super::{TestApp, get, send};

/// Install a stub module `id` whose `module.json` ends with `extra` (`""`, or
/// `, "settings": {...}`), and the token its callbacks carry.
pub fn installed_module(t: &TestApp, id: &str, extra: &str) -> String {
    let dir = t
        .state
        .config
        .data_dir
        .join(kroma_module_supervisor::INSTALLED_DIR)
        .join(id);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("module.json"),
        format!(
            r#"{{ "schemaVersion": {}, "id": "{id}", "name": "Stub", "version": "1.0.0"{extra} }}"#,
            kroma_module_manifest::MODULE_SCHEMA_VERSION,
        ),
    )
    .unwrap();
    t.supervisor.module_token(id)
}

/// `GET /_host/setting` for `key` as a string, on the module socket.
pub async fn read_setting(t: &TestApp, token: &str, key: &str) -> (StatusCode, Value) {
    let uri = format!("/api/_host/setting?key={key}&kind=str&default=");
    get(&t.seam, &uri, Some(token)).await
}

/// `POST /_host/settings` with `patch`, on the module socket.
pub async fn write_settings(t: &TestApp, token: &str, patch: Value) -> (StatusCode, Value) {
    let body = json!({ "patch": patch });
    send(
        &t.seam,
        "POST",
        "/api/_host/settings",
        Some(token),
        Some(body),
    )
    .await
}

/// Store `values` the way an operator saving them would.
pub fn store_settings(t: &TestApp, values: &[(&str, Value)]) {
    let patch = values.iter().map(|(k, v)| (k.to_string(), v.clone()));
    t.state
        .settings
        .set_patch(&t.state.db, BTreeMap::from_iter(patch));
}

/// A registry on loopback serving `index`, and each `(module id, record)` as
/// that module's full record. Answers with the URL of its descriptor.
pub async fn registry_serving(index: Value, records: &[(&str, Value)]) -> String {
    let serve = |body: Value| {
        axum::routing::get(move || {
            let body = body.clone();
            async move { axum::Json(body) }
        })
    };
    let ids: Vec<Value> = index
        .as_array()
        .map(|rows| rows.iter().map(|row| row["id"].clone()).collect())
        .unwrap_or_default();
    let descriptor = json!({ "apiVersion": 1, "name": "Test", "url": "https://test", "modules": ids });
    let mut app = axum::Router::new()
        .route("/registry.json", serve(descriptor))
        .route("/index.json", serve(index));
    for (id, record) in records {
        app = app.route(&format!("/m/{id}.json"), serve(record.clone()));
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    format!("http://{addr}/registry.json")
}

/// Aim the Store's official registry at `url`.
pub fn point_store_at(t: &TestApp, url: &str) {
    store_settings(t, &[("moduleRegistryUrl", json!(url))]);
}
