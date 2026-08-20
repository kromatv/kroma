//! The host seam between the running app and a module's backend: a module crate
//! names only the [`HostCtx`] trait here, never `kroma-engine`, so the two do not
//! form a dependency cycle.

// The axum `Response` is deliberately the Err type of request guards so handlers
// short-circuit with `?`.
#![allow(clippy::result_large_err)]

pub mod host_token;

/// The `storage` capability: the module-private and scoped-core databases. Off
/// unless the module declares storage, which is what keeps SQLite out of the
/// eight sidecars that never open one.
#[cfg(feature = "storage")]
pub mod storage;

#[cfg(any(test, feature = "testing"))]
pub mod testing;

/// [`test_serve::serve`] and [`test_serve::blocking`]: the wire-level helpers a
/// point contract's round-trip test needs, without the database `testing` drags in.
#[cfg(any(test, feature = "test-serve"))]
pub mod test_serve;

mod auth;
mod host_ctx;
mod module;
mod port;

pub use auth::*;
pub use host_ctx::*;
pub use module::*;
pub use port::*;

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;

pub use async_trait::async_trait;
pub use kroma_domain::{
    ActionKind, ActionSpec, ActionStyle, Audience, NotificationCategory, NotificationEvent,
    NotificationSpec, PushCategory,
};

/// Build a JSON error response `{ "error": "<message>" }` with the given status.
pub fn json_error(status: StatusCode, message: &str) -> Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}

/// Run a blocking DB closure off the async runtime, mapping any failure to a
/// uniform 500.
pub async fn blocking<T, F>(f: F) -> Result<T, Response>
where
    F: FnOnce() -> anyhow::Result<T> + Send + 'static,
    T: Send + 'static,
{
    match tokio::task::spawn_blocking(f).await {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(e)) => {
            tracing::error!(error = %e, "database error");
            Err(json_error(StatusCode::INTERNAL_SERVER_ERROR, "internal error"))
        }
        Err(e) => {
            tracing::error!(error = %e, "task join error");
            Err(json_error(StatusCode::INTERNAL_SERVER_ERROR, "internal error"))
        }
    }
}

#[cfg(feature = "storage")]
pub use storage::{query, HostStorage};

/// A real-time event a module publishes onto the host's bus, fanned out to
/// WebSocket clients as `{ "type": <topic>, ...payload }`.
pub struct Event {
    pub topic: String,
    pub payload: serde_json::Value,
}

impl Event {
    pub fn new(topic: impl Into<String>, payload: serde_json::Value) -> Self {
        Self { topic: topic.into(), payload }
    }
}

/// One configured library, in the leaf shape a module needs to place files.
/// `kind` is `movies` or `shows`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LibraryFolders {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub folders: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_error_carries_the_status() {
        let resp = json_error(StatusCode::NOT_FOUND, "gone");
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
        let resp = json_error(StatusCode::FORBIDDEN, "no");
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    #[test]
    fn event_new_keeps_topic_and_payload() {
        let ev = Event::new("download.progress", serde_json::json!({ "pct": 42 }));
        assert_eq!(ev.topic, "download.progress");
        assert_eq!(ev.payload["pct"], 42);
    }

    #[tokio::test]
    async fn blocking_returns_value_and_maps_failure_to_500() {
        let ok: Result<i32, Response> = blocking(|| Ok(21 * 2)).await;
        assert_eq!(ok.unwrap(), 42);

        let err = blocking::<i32, _>(|| Err(anyhow::anyhow!("db down"))).await;
        assert_eq!(err.unwrap_err().status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[tokio::test]
    async fn a_panicking_blocking_task_becomes_a_500_rather_than_taking_the_server_down() {
        let panicked = blocking::<i32, _>(|| panic!("a module's closure panicked")).await;
        assert_eq!(panicked.unwrap_err().status(), StatusCode::INTERNAL_SERVER_ERROR);
    }
}
