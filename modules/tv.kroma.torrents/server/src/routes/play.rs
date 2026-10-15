use std::path::Path;

use axum::extract::{Path as AxPath, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::Response;
use axum::routing::get;
use axum::Router;

use kroma_module_sdk::host::{json_error, HostStorage};
use kroma_module_sdk::media::stream::{content_type_for, stream_reader};
use kroma_module_sdk::media::Unmetered;

use super::dm;
use crate::downloads::Reading;

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/play/{token}", get(play::<S>))
        .route("/_read/{token}", get(read_for_the_module::<S>))
}

async fn play<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AxPath(token): AxPath<String>,
    headers: HeaderMap,
) -> Result<Response, Response> {
    served(&state, &token, &headers, Reading::ForAViewer).await
}

// The same bytes, for the probe and the remux this module runs itself: they hold
// the download in the watch cache and are not somebody watching.
async fn read_for_the_module<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AxPath(token): AxPath<String>,
    headers: HeaderMap,
) -> Result<Response, Response> {
    served(&state, &token, &headers, Reading::Internally).await
}

async fn served<S: HostStorage + Clone + Send + Sync + 'static>(
    state: &S,
    token: &str,
    headers: &HeaderMap,
    reading: Reading,
) -> Result<Response, Response> {
    let manager = dm(state);
    let grant = manager
        .play_grant(token)
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "unknown or expired play token"))?;
    let stream = manager
        .open_stream(&grant, reading)
        .await
        .map_err(|e| json_error(StatusCode::SERVICE_UNAVAILABLE, &format!("{e:#}")))?;
    let content_type = content_type_for(Path::new(&stream.file_name));
    let len = stream.len;
    let mut response = stream_reader(stream, len, content_type, headers, Unmetered).await;
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(response)
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt as _;

    use kroma_module_sdk::host::testing::StubHost;

    use super::*;
    use crate::downloads::test_support::manager_over;

    #[tokio::test]
    async fn the_two_paths_are_the_viewer_s_and_the_module_s_own() {
        let (host, manager) = manager_over("routes-play-kinds", &[]);
        let app = routes::<StubHost>().with_state(host.with_service(manager));

        let mut found = Vec::new();
        for path in ["/play/nope", "/_read/nope"] {
            let answer = app
                .clone()
                .oneshot(Request::get(path).body(Body::empty()).unwrap())
                .await
                .unwrap();
            found.push(answer.status());
        }

        assert_eq!(found, [StatusCode::NOT_FOUND, StatusCode::NOT_FOUND]);
    }

    #[tokio::test]
    async fn an_unknown_token_is_not_found_and_asks_for_no_session() {
        let (host, manager) = manager_over("routes-play", &[]);
        let app = routes::<StubHost>().with_state(host.with_service(manager));

        let response = app
            .oneshot(Request::get("/play/nope").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}
