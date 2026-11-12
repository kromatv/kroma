use std::sync::Arc;

use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Extension, Json, Router};
use kroma_module_sdk::host::{port_reply, run_blocking};
use serde::Deserialize;

use crate::trailers::{Fetched, Trailers, VideoId};

const DEFAULT_MAX_HEIGHT: u32 = 1080;

/// The `trailer` point as this module answers it: `fetch` a video into the
/// module's folder, `read` the finished MP4 back a slice at a time, and
/// `forget` it once the core holds its own copy.
pub fn routes<S: Clone + Send + Sync + 'static>(trailers: Arc<Trailers>) -> Router<S> {
    Router::new()
        .route("/_port/trailer/fetch", post(fetch))
        .route("/_port/trailer/read", post(read))
        .route("/_port/trailer/forget", post(forget))
        .layer(Extension(trailers))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FetchBody {
    video: String,
    #[serde(default)]
    max_height: Option<u32>,
}

#[derive(Deserialize)]
struct ReadBody {
    video: String,
    offset: u64,
    length: u64,
}

#[derive(Deserialize)]
struct ForgetBody {
    video: String,
}

async fn fetch(
    Extension(trailers): Extension<Arc<Trailers>>,
    Json(body): Json<FetchBody>,
) -> Json<Result<Fetched, String>> {
    port_reply(move || {
        let video = VideoId::parse(&body.video)?;
        trailers.fetch(&video, body.max_height.unwrap_or(DEFAULT_MAX_HEIGHT))
    })
    .await
}

async fn read(
    Extension(trailers): Extension<Arc<Trailers>>,
    Json(body): Json<ReadBody>,
) -> Response {
    let answered = run_blocking(move || {
        let video = VideoId::parse(&body.video)?;
        trailers.read(&video, body.offset, body.length)
    })
    .await;
    match answered {
        Ok(Ok(bytes)) => {
            ([(header::CONTENT_TYPE, "application/octet-stream")], bytes).into_response()
        }
        Ok(Err(error)) => (StatusCode::NOT_FOUND, format!("{error:#}")).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

async fn forget(
    Extension(trailers): Extension<Arc<Trailers>>,
    Json(body): Json<ForgetBody>,
) -> Json<Result<(), String>> {
    port_reply(move || trailers.forget(&VideoId::parse(&body.video)?)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    use axum::body::{to_bytes, Body};
    use axum::http::Request;
    use kroma_module_sdk::testing::temp_dir;
    use tower::ServiceExt;

    fn post_json(path: &str, body: &str) -> Request<Body> {
        Request::post(path)
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    #[tokio::test]
    async fn a_read_of_a_trailer_never_fetched_is_a_404() {
        let dir = temp_dir("trailers-serve");
        let app: Router = routes(Arc::new(Trailers::new(dir.path())));

        let response = app
            .oneshot(post_json(
                "/_port/trailer/read",
                r#"{"video":"qu5n7RALVpE","offset":0,"length":10}"#,
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn a_fetch_of_a_malformed_id_answers_the_error_envelope() {
        let dir = temp_dir("trailers-serve");
        let app: Router = routes(Arc::new(Trailers::new(dir.path())));

        let response = app
            .oneshot(post_json("/_port/trailer/fetch", r#"{"video":"../x"}"#))
            .await
            .unwrap();

        let body = to_bytes(response.into_body(), 1 << 16).await.unwrap();
        let answer: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert!(answer["Err"]
            .as_str()
            .unwrap()
            .contains("not a YouTube video id"));
    }
}
