//! The out-of-process provider side of the acquisition search / grab surface:
//! the routes the acquisition `.kmod` serves for the core's
//! `/api/requests/:id/search` + `/grab` endpoints (via `AcquisitionSearchPort`).
//!
//! These live here (not in the generic bridge) because `grab` backgrounds the
//! slow engine add with the owned host -- the handler's `State<S>` gives it one,
//! which the generic bridge can't.

use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use kroma_module_sdk::host::HostCtx;
use serde::Deserialize;

/// The routes the acquisition sidecar mounts for its search port.
pub fn acqsearch_routes<S: HostCtx + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/_port/acqsearch/search", post(search_h::<S>))
        .route("/_port/acqsearch/grab", post(grab_h::<S>))
}

/// Run a blocking provider call into the `Result<T, String>` wire envelope.
async fn blocking_env<T: Send + 'static>(
    job: impl FnOnce() -> anyhow::Result<T> + Send + 'static,
) -> Json<Result<T, String>> {
    Json(
        tokio::task::spawn_blocking(job)
            .await
            .map_err(|e| e.to_string())
            .and_then(|r| r.map_err(|e| format!("{e:#}"))),
    )
}

#[derive(Deserialize)]
struct SearchReq {
    request_id: String,
}

async fn search_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<SearchReq>,
) -> Json<Result<serde_json::Value, String>> {
    blocking_env(move || Ok(serde_json::to_value(crate::search::interactive_search(&host, &req.request_id)?)?))
        .await
}

#[derive(Deserialize)]
struct GrabReq {
    request_id: String,
    guid: String,
    indexer_id: String,
}

async fn grab_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<GrabReq>,
) -> Json<Result<String, String>> {
    blocking_env(move || {
        let row = crate::search::grab_cached(&host, &req.request_id, &req.guid, &req.indexer_id)?;
        let id = row.id.clone();
        // Background the slow engine add (magnet resolve / .torrent fetch) so the
        // grab returns immediately, matching the core's former behavior. The grab
        // client's `activate` is a blocking HTTP call to the torrents sidecar, so a
        // plain thread (no runtime needed) is enough.
        std::thread::spawn(move || crate::downloads(&host).activate(&host, &row));
        Ok(id)
    })
    .await
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt as _;

    use super::*;

    /// A host with a real (empty) database. The two handlers reach the request
    /// ledger and stop there, which is all these tests need.
    #[derive(Clone)]
    struct DbHost {
        pool: kroma_module_sdk::db::Pool,
    }

    impl DbHost {
        fn new() -> Self {
            static SEQ: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
            let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let path =
                std::env::temp_dir().join(format!("kroma-acqserve-{}-{n}.db", std::process::id()));
            let _ = std::fs::remove_file(&path);
            Self { pool: kroma_module_sdk::db::init(&path).expect("init db") }
        }
    }

    impl HostCtx for DbHost {
        fn db(&self) -> &kroma_module_sdk::db::Pool {
            &self.pool
        }
        fn data_dir(&self) -> &std::path::Path {
            std::path::Path::new("/tmp")
        }
        fn require(
            &self,
            _user: &kroma_module_sdk::domain::User,
            _perm: kroma_module_sdk::domain::Permission,
        ) -> Result<(), axum::response::Response> {
            Ok(())
        }
        fn require_any_admin(
            &self,
            _user: &kroma_module_sdk::domain::User,
        ) -> Result<(), axum::response::Response> {
            Ok(())
        }
        fn lerr(
            &self,
            _user: &kroma_module_sdk::domain::User,
            _status: axum::http::StatusCode,
            _key: &str,
        ) -> axum::response::Response {
            unimplemented!("not exercised")
        }
        fn setting_str(&self, _key: &str, default: &str) -> String {
            default.to_string()
        }
        fn setting_bool(&self, _key: &str, default: bool) -> bool {
            default
        }
        fn setting_i64(&self, _key: &str, default: i64) -> i64 {
            default
        }
        fn set_settings(&self, _patch: std::collections::BTreeMap<String, serde_json::Value>) {}
        fn publish(&self, _event: kroma_module_sdk::host::Event) {}
        fn trigger_job(&self, _key: &'static str, _reason: &'static str) {}
        fn module_enabled(&self, _id: &str) -> bool {
            true
        }
        fn library_folders(&self) -> Vec<kroma_module_sdk::host::LibraryFolders> {
            Vec::new()
        }
        fn tmdb_api_key(&self) -> Option<String> {
            None
        }
        fn metadata_language(&self) -> String {
            "en".into()
        }
        fn get_service(
            &self,
            _t: std::any::TypeId,
        ) -> Option<std::sync::Arc<dyn std::any::Any + Send + Sync>> {
            None
        }
    }

    async fn post(path: &str, body: serde_json::Value) -> (StatusCode, serde_json::Value) {
        let host = DbHost::new();
        let app = acqsearch_routes::<DbHost>().with_state(host);
        let req = Request::builder()
            .method("POST")
            .uri(path)
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        let status = resp.status();
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    #[tokio::test]
    async fn both_routes_are_mounted_where_the_core_calls_them() {
        // The consumer builds `/_port/acqsearch/<method>` by hand in another
        // crate, so a path renamed on one side only fails at runtime, in a
        // different process, with no compile error anywhere.
        let (status, _) = post("/_port/acqsearch/search", serde_json::json!({ "request_id": "r1" })).await;
        assert_eq!(status, StatusCode::OK);

        let (status, _) = post(
            "/_port/acqsearch/grab",
            serde_json::json!({ "request_id": "r1", "guid": "g", "indexer_id": "i" }),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
    }

    #[tokio::test]
    async fn a_search_for_a_request_that_is_not_there_answers_err_not_a_500() {
        // The wire shape is `Result<T, String>`: the HTTP status stays 200 and
        // the failure travels INSIDE the envelope, because that is what the
        // client deserializes. A 500 would surface as a transport error and lose
        // the reason.
        let (status, body) =
            post("/_port/acqsearch/search", serde_json::json!({ "request_id": "nope" })).await;
        assert_eq!(status, StatusCode::OK);
        let err = body["Err"].as_str().expect("an Err envelope");
        assert!(err.contains("request not found"), "{err}");
    }

    #[tokio::test]
    async fn a_grab_for_a_request_that_is_not_there_answers_err_too() {
        let (status, body) = post(
            "/_port/acqsearch/grab",
            serde_json::json!({ "request_id": "nope", "guid": "g", "indexer_id": "i" }),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert!(body["Err"].as_str().is_some(), "{body}");
    }

    #[tokio::test]
    async fn a_malformed_body_is_rejected_by_the_extractor() {
        // The body keys are half the contract with the client; a missing one
        // must fail loudly here rather than be read as an empty request id.
        let (status, _) = post("/_port/acqsearch/search", serde_json::json!({})).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

        let (status, _) = post(
            "/_port/acqsearch/grab",
            serde_json::json!({ "request_id": "r1", "guid": "g" }),
        )
        .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    }
}
