use axum::body::Body;
use axum::http::{Request, StatusCode};
use kroma_module_host::SettingReachOf;
use kroma_module_host::testing::StubHost;
use serde_json::{Value, json};
use tower::ServiceExt;

use super::Modules;

async fn send(
    modules: &Modules,
    reach: SettingReachOf,
    host: StubHost,
    req: Request<Body>,
) -> (StatusCode, String) {
    let res = modules
        .router::<StubHost>(reach)
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

/// `GET /_host/setting` for `key` as a string, with `token` as the bearer.
pub async fn read_setting(
    modules: &Modules,
    reach: SettingReachOf,
    host: StubHost,
    token: &str,
    key: &str,
) -> (StatusCode, String) {
    let req = Request::builder()
        .method("GET")
        .uri(format!("/_host/setting?key={key}&kind=str&default="))
        .header("authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    send(modules, reach, host, req).await
}

/// `POST /_host/settings` with `patch`, with `token` as the bearer.
pub async fn write_settings(
    modules: &Modules,
    reach: SettingReachOf,
    host: StubHost,
    token: &str,
    patch: Value,
) -> (StatusCode, String) {
    let req = Request::builder()
        .method("POST")
        .uri("/_host/settings")
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json")
        .body(Body::from(json!({ "patch": patch }).to_string()))
        .unwrap();
    send(modules, reach, host, req).await
}

/// The `error` a refused callback answered with.
pub fn refusal(body: &str) -> String {
    let answer: Value = serde_json::from_str(body).unwrap();
    answer["error"].as_str().unwrap().to_string()
}
