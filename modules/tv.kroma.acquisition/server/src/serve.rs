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
    #[serde(default)]
    scope: crate::search::SearchScope,
}

async fn search_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<SearchReq>,
) -> Json<Result<serde_json::Value, String>> {
    blocking_env(move || {
        Ok(serde_json::to_value(crate::search::interactive_search(
            &host,
            &req.request_id,
            req.scope,
        )?)?)
    })
    .await
}

#[derive(Deserialize)]
struct GrabReq {
    request_id: String,
    #[serde(default)]
    scope: crate::search::SearchScope,
    guid: String,
    indexer_id: String,
}

async fn grab_h<S: HostCtx + Clone + Send + Sync + 'static>(
    State(host): State<S>,
    Json(req): Json<GrabReq>,
) -> Json<Result<String, String>> {
    blocking_env(move || {
        let row =
            crate::search::grab_cached(&host, &req.request_id, req.scope, &req.guid, &req.indexer_id)?;
        let id = row.id.clone();
        // Background the slow engine add so the grab returns immediately; `activate`
        // is a blocking HTTP call, so a plain thread (no runtime needed) is enough.
        std::thread::spawn(move || match crate::downloads(&host) {
            Ok(downloads) => downloads.activate(&host, &row),
            Err(e) => tracing::warn!(target: "acquisition", "grabbed but not started: {e:#}"),
        });
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

    type DbHost = kroma_module_sdk::host::testing::StubHost;

    fn db_host() -> DbHost {
        DbHost::with_db("acqserve")
    }

    async fn post(path: &str, body: serde_json::Value) -> (StatusCode, serde_json::Value) {
        let host = db_host();
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
    async fn a_scoped_search_is_accepted_and_an_absent_scope_defaults_to_the_whole_request() {
        // The scope is the one field the caller may legitimately omit (the
        // automatic pass never narrows), so it must not be a required key.
        for scope in [
            serde_json::json!({ "kind": "movie" }),
            serde_json::json!({ "kind": "season", "season": 2 }),
            serde_json::json!({ "kind": "episode", "season": 2, "episode": 5 }),
        ] {
            let (status, body) =
                post("/_port/acqsearch/search", serde_json::json!({ "request_id": "r1", "scope": scope }))
                    .await;
            assert_eq!(status, StatusCode::OK, "{scope}");
            // No such request in the stub db, so it answers Err -- what matters
            // here is that the extractor accepted the scope shape.
            assert!(body["Err"].as_str().is_some(), "{body}");
        }
    }

    #[tokio::test]
    async fn an_unknown_scope_shape_is_rejected_by_the_extractor() {
        let (status, _) = post(
            "/_port/acqsearch/search",
            serde_json::json!({ "request_id": "r1", "scope": { "kind": "sideways" } }),
        )
        .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
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
