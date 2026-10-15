//! The points this module answers, and the ones it calls.

pub mod indexers;
pub mod ledger;
pub mod vpn;
pub mod watchable;

use std::sync::Arc;

use kroma_module_sdk::host::{service, HostCtx};

use crate::DownloadManager;

fn manager<S: HostCtx>(host: &S) -> anyhow::Result<Arc<DownloadManager>> {
    service::<DownloadManager>(host)
        .ok_or_else(|| anyhow::anyhow!("the download manager is not running yet"))
}

#[cfg(test)]
async fn post<S: Clone + Send + Sync + 'static>(
    app: axum::Router<S>,
    host: S,
    path: &str,
    body: serde_json::Value,
) -> (axum::http::StatusCode, serde_json::Value) {
    let req = axum::http::Request::post(path)
        .header("content-type", "application/json")
        .body(axum::body::Body::from(body.to_string()))
        .unwrap();
    let resp = tower::ServiceExt::oneshot(app.with_state(host), req)
        .await
        .unwrap();
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null),
    )
}
