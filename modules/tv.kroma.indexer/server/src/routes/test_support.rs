use axum::body::Body;
use axum::http::{Request, StatusCode};
use kroma_module_sdk::domain::{LibraryScope, User};
use kroma_module_sdk::host::testing::StubHost;
use kroma_module_sdk::host::HostStorage;
use serde_json::{json, Value};
use tower::ServiceExt as _;

use crate::admin::{definition_store, KIND_BUILTIN};
use crate::db::{self, IndexerRow};

pub(super) const DEFINITION: &str = "\
id: demo
name: Demo Tracker
type: public
description: A tracker for the tests
links:
  - http://127.0.0.1:1/
settings:
  - name: username
    type: text
    label: Login
  - name: password
    type: password
caps:
  modes:
    search: [q]
search:
  rows:
    selector: tr
";

fn user() -> User {
    User {
        id: "u1".into(),
        email: "a@b.c".into(),
        username: "ana".into(),
        avatar_url: None,
        language: None,
        audio_language: None,
        subtitle_language: None,
        permissions: Vec::new(),
        libraries: LibraryScope::All,
        created_at: "2024-01-01T00:00:00Z".into(),
        has_pin: false,
    }
}

pub(super) fn host() -> StubHost {
    let pool = kroma_module_sdk::db::testing::temp_pool("indexer-routes");
    kroma_module_sdk::db::apply_migrations(&pool.get().unwrap(), db::MIGRATIONS).unwrap();
    StubHost::with_store((*pool).clone()).with_session("tok", user())
}

pub(super) fn with_definition(host: StubHost) -> StubHost {
    let dir = definition_store(&host).dir().to_path_buf();
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("demo.yml"), DEFINITION).unwrap();
    host
}

pub(super) fn row(id: &str, kind: &str) -> IndexerRow {
    let builtin = kind == KIND_BUILTIN;
    IndexerRow {
        id: id.into(),
        name: id.to_uppercase(),
        url: "http://127.0.0.1:1/".into(),
        api_key: "SECRET".into(),
        categories: vec![2000],
        enabled: true,
        priority: 0,
        kind: kind.into(),
        definition_id: builtin.then(|| "demo".to_string()),
        settings: json!({ "username": "ana", "password": "hunter2" }).to_string(),
        last_ok_at: None,
        last_error: None,
        created_at: 0,
    }
}

pub(super) fn seed(host: &StubHost, row: &IndexerRow) {
    db::insert_indexer(host.store(), row).unwrap();
}

pub(super) async fn call(
    host: &StubHost,
    method: &str,
    path: &str,
    body: Value,
) -> (StatusCode, Value) {
    let app = super::routes::<StubHost>().with_state(host.clone());
    let req = Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json")
        .header("authorization", "Bearer tok")
        .body(Body::from(body.to_string()))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}
