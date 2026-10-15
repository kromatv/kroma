//! Driving one request through the router under test, in-process.

use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{Request, StatusCode};
use axum::Router;
use serde_json::Value;
use tower::ServiceExt;

fn build_request(
    method: &str,
    uri: &str,
    token: Option<&str>,
    body: Option<String>,
) -> Request<Body> {
    let mut builder = Request::builder().method(method).uri(uri);
    if let Some(t) = token {
        builder = builder.header("authorization", format!("Bearer {t}"));
    }
    let body = match body {
        Some(json) => {
            builder = builder.header("content-type", "application/json");
            Body::from(json)
        }
        None => Body::empty(),
    };
    let mut req = builder.body(body).expect("build request");
    req.extensions_mut()
        .insert(ConnectInfo(std::net::SocketAddr::from((
            [127, 0, 0, 1],
            40000,
        ))));
    req
}

/// Drive one request against the router and return `(status, headers, parsed-json)`.
/// A non-JSON or empty body (204, `text/plain` logs) parses to [`Value::Null`].
pub async fn raw(
    app: &Router,
    method: &str,
    uri: &str,
    token: Option<&str>,
    json: Option<Value>,
    headers: &[(&str, &str)],
) -> (StatusCode, axum::http::HeaderMap, Value) {
    use axum::http::{HeaderName, HeaderValue};
    let body = json.map(|v| v.to_string());
    let mut req = build_request(method, uri, token, body);
    for (k, v) in headers {
        req.headers_mut().insert(
            HeaderName::from_bytes(k.as_bytes()).expect("header name"),
            HeaderValue::from_str(v).expect("header value"),
        );
    }
    let resp = app.clone().oneshot(req).await.expect("router response");
    let status = resp.status();
    let out_headers = resp.headers().clone();
    let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .expect("read body");
    let value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    (status, out_headers, value)
}

/// Drive one request against the router and return `(status, parsed-json)`. A
/// non-JSON or empty body (204, `text/plain` logs) parses to [`Value::Null`].
pub async fn send(
    app: &Router,
    method: &str,
    uri: &str,
    token: Option<&str>,
    json: Option<Value>,
) -> (StatusCode, Value) {
    let (status, _headers, value) = raw(app, method, uri, token, json, &[]).await;
    (status, value)
}

/// `GET` convenience over [`send`].
pub async fn get(app: &Router, uri: &str, token: Option<&str>) -> (StatusCode, Value) {
    send(app, "GET", uri, token, None).await
}

/// Drive one request and return `(status, body as text)`, for the handlers that
/// answer `text/plain`, which [`send`] flattens to [`Value::Null`].
pub async fn text(
    app: &Router,
    method: &str,
    uri: &str,
    token: Option<&str>,
    json: Option<Value>,
) -> (StatusCode, String) {
    let req = build_request(method, uri, token, json.map(|v| v.to_string()));
    let resp = app.clone().oneshot(req).await.expect("router response");
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .expect("read body");
    (status, String::from_utf8_lossy(&bytes).into_owned())
}
