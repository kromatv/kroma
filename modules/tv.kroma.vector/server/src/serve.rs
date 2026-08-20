//! The out-of-process provider side of the embedder: HTTP routes the vector
//! `.kmod` serves so the core (and any module) can embed text over the port
//! bridge. `embed_batch` is the important one: a catalog-wide reembed sends every
//! document in ONE request, so the sidecar stays fast despite living in another
//! process (per-item IPC would be thousands of round-trips).

use std::sync::Arc;

use axum::routing::post;
use axum::{Extension, Json, Router};
use serde::Deserialize;
use serde_json::json;

use crate::Embedder;

/// The routes the vector sidecar mounts for the embedder port. Generic over the
/// process state `S` (the runtime's `RemoteHost`); the embedder is stateless
/// compute, so it rides in an `Extension` rather than needing the host.
pub fn embedder_routes<S: Clone + Send + Sync + 'static>(emb: Arc<dyn Embedder>) -> Router<S> {
    Router::new()
        .route("/_port/embedder/embed", post(embed_h))
        .route("/_port/embedder/embed_batch", post(embed_batch_h))
        .route("/_port/embedder/meta", post(meta_h))
        .layer(Extension(emb))
}

#[derive(Deserialize)]
struct EmbedReq {
    text: String,
}

async fn embed_h(
    Extension(emb): Extension<Arc<dyn Embedder>>,
    Json(req): Json<EmbedReq>,
) -> Json<Vec<f32>> {
    // Embedding is CPU work; run it off the async runtime.
    let v = tokio::task::spawn_blocking(move || emb.embed(&req.text)).await.unwrap_or_default();
    Json(v)
}

#[derive(Deserialize)]
struct EmbedBatchReq {
    texts: Vec<String>,
}

async fn embed_batch_h(
    Extension(emb): Extension<Arc<dyn Embedder>>,
    Json(req): Json<EmbedBatchReq>,
) -> Json<Vec<Vec<f32>>> {
    let out = tokio::task::spawn_blocking(move || {
        req.texts.iter().map(|t| emb.embed(t)).collect::<Vec<_>>()
    })
    .await
    .unwrap_or_default();
    Json(out)
}

async fn meta_h(Extension(emb): Extension<Arc<dyn Embedder>>) -> Json<serde_json::Value> {
    Json(json!({ "dim": emb.dim(), "relevance_floor": emb.relevance_floor() }))
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt as _;

    use super::*;

    // An embedder whose output encodes its input, so a test can tell which
    // text produced which vector - and therefore whether the ORDER survived.
    struct Marking;

    impl Embedder for Marking {
        fn dim(&self) -> usize {
            3
        }
        fn embed(&self, text: &str) -> Vec<f32> {
            vec![text.len() as f32, text.chars().next().map_or(0.0, |c| c as u32 as f32), 1.0]
        }
        fn relevance_floor(&self) -> f32 {
            0.25
        }
    }

    fn app() -> Router {
        let emb: Arc<dyn Embedder> = Arc::new(Marking);
        embedder_routes::<()>(emb).with_state(())
    }

    async fn post(path: &str, body: serde_json::Value) -> (StatusCode, serde_json::Value) {
        let req = Request::builder()
            .method("POST")
            .uri(path)
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        let resp = app().oneshot(req).await.unwrap();
        let status = resp.status();
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    #[tokio::test]
    async fn one_text_embeds_to_one_vector() {
        let (status, body) = post("/_port/embedder/embed", json!({ "text": "abcd" })).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, json!([4.0, 97.0, 1.0]));
    }

    #[tokio::test]
    async fn a_batch_comes_back_in_the_order_it_was_sent() {
        // This is the whole reason `embed_batch` exists: a catalog-wide reembed
        // sends every document in ONE request and zips the answers back onto the
        // ids by POSITION. Reordering here silently attaches every vector to the
        // wrong title.
        let (status, body) = post(
            "/_port/embedder/embed_batch",
            json!({ "texts": ["a", "bb", "ccc"] }),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let rows = body.as_array().expect("an array");
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0][0], 1.0);
        assert_eq!(rows[1][0], 2.0);
        assert_eq!(rows[2][0], 3.0);
    }

    #[tokio::test]
    async fn an_empty_batch_is_an_empty_answer_not_an_error() {
        // The caller filters out titles that need no work, so an empty list is a
        // normal request rather than a bug.
        let (status, body) = post("/_port/embedder/embed_batch", json!({ "texts": [] })).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, json!([]));
    }

    #[tokio::test]
    async fn the_meta_endpoint_reports_what_the_caller_needs_to_decide_with() {
        // `dim` is what the reembed job compares against to decide whether a
        // stored vector is stale, and the floor is backend-specific - a sidecar
        // that misreported either would leave recommendations quietly wrong.
        let (status, meta) = post("/_port/embedder/meta", json!({})).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(meta["dim"], 3);
        assert_eq!(meta["relevance_floor"], 0.25);
    }

    #[tokio::test]
    async fn the_routes_are_mounted_where_the_client_looks_for_them() {
        // The consumer-side proxy builds `/_port/embedder/<method>` by hand, so
        // a path renamed on one side only fails at runtime in another process.
        for path in ["/_port/embedder/embed", "/_port/embedder/embed_batch", "/_port/embedder/meta"] {
            let (status, _) = post(path, json!({ "text": "x", "texts": [] })).await;
            assert_eq!(status, StatusCode::OK, "{path}");
        }
    }
}
