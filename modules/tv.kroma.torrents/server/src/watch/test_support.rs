use std::sync::Arc;

use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use axum::Router;
use serde_json::Value;
use tower::ServiceExt as _;

use kroma_module_sdk::domain::{LibraryScope, Permission, User};
use kroma_module_sdk::host::testing::StubHost;
use kroma_module_sdk::host::HostCtx as _;

use super::Watch;

pub(super) const BEARER: &str = "watch-session";
pub(super) const OTHER_BEARER: &str = "watch-other-session";

const NOTHING_ANSWERS: u16 = 1;

pub(super) fn watch_engine(host: &StubHost) -> Arc<Watch> {
    Watch::new(host.data_dir(), NOTHING_ANSWERS, 2)
}

pub(super) fn member() -> User {
    User {
        id: "u1".into(),
        email: "ana@t.dev".into(),
        username: "ana".into(),
        avatar_url: None,
        language: None,
        audio_language: None,
        subtitle_language: None,
        permissions: Vec::new(),
        libraries: LibraryScope::All,
        created_at: "now".into(),
        has_pin: false,
    }
}

/// A second account holding the right, so a test can ask what one member is
/// shown of what another started.
pub(super) fn other_member() -> User {
    User {
        id: "u2".into(),
        email: "bo@t.dev".into(),
        username: "bo".into(),
        ..member()
    }
}

pub(super) fn watcher() -> User {
    User {
        permissions: vec![Permission::WatchablePlay],
        ..member()
    }
}

pub(super) async fn call(
    app: Router<StubHost>,
    host: StubHost,
    method: &str,
    path: &str,
) -> (StatusCode, Value) {
    call_as(app, host, BEARER, method, path).await
}

pub(super) async fn call_as(
    app: Router<StubHost>,
    host: StubHost,
    bearer: &str,
    method: &str,
    path: &str,
) -> (StatusCode, Value) {
    let request = Request::builder()
        .method(method)
        .uri(path)
        .header("authorization", format!("Bearer {bearer}"))
        .body(Body::empty())
        .unwrap();
    answered(app, host, request).await
}

pub(super) async fn post_json(
    app: Router<StubHost>,
    host: StubHost,
    path: &str,
    body: Value,
) -> (StatusCode, Value) {
    let request = Request::builder()
        .method("POST")
        .uri(path)
        .header("authorization", format!("Bearer {BEARER}"))
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    answered(app, host, request).await
}

pub(super) async fn anonymous(
    app: Router<StubHost>,
    host: StubHost,
    method: &str,
    path: &str,
) -> StatusCode {
    let request = Request::builder()
        .method(method)
        .uri(path)
        .body(Body::empty())
        .unwrap();
    answered(app, host, request).await.0
}

async fn answered(
    app: Router<StubHost>,
    host: StubHost,
    request: Request<Body>,
) -> (StatusCode, Value) {
    let response = app.with_state(host).oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}
