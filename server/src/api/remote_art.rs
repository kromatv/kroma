//! Provider artwork served by this server: the signed image route, and the
//! layer that points every JSON answer at it.

use axum::body::{to_bytes, Body};
use axum::extract::{Path, Request, State};
use axum::http::{header, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;

use crate::api::error::json_error;
use crate::api::util::blocking;
use crate::services::remote_art::{self, Art};
use crate::state::SharedState;

pub fn routes() -> Router<SharedState> {
    Router::new().route("/images/tmdb/{signature}/{size}/{file}", get(image))
}

/// `GET /api/images/tmdb/:signature/:size/:file` → an image the provider
/// hosts, downloaded once under the `artwork` purpose and served from disk
/// after that. Public, as an `<img>` sends no bearer, and answered only for a
/// path this server signed. Sent under a policy that runs nothing in it.
pub async fn image(
    State(state): State<SharedState>,
    Path((signature, size, file)): Path<(String, String, String)>,
) -> Response {
    let Some(art) = Art::parse(&size, &file) else {
        return json_error(StatusCode::BAD_REQUEST, "invalid image name");
    };
    if !art.signed_by(&state.media_ticket_key, &signature) {
        return json_error(StatusCode::FORBIDDEN, "not an image this server named");
    }
    let content_type = art.content_type();
    let data_dir = state.config.data_dir.clone();
    let fetched = blocking(move || {
        Ok(Art::parse(&size, &file)
            .and_then(|art| remote_art::fetch(&data_dir, remote_art::PROVIDER, art)))
    })
    .await;
    let Ok(Some(path)) = fetched else {
        return json_error(StatusCode::NOT_FOUND, "image not found");
    };
    match tokio::fs::read(&path).await {
        Ok(bytes) => (
            [
                (header::CONTENT_TYPE, content_type),
                (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
                (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
                (
                    header::CONTENT_SECURITY_POLICY,
                    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
                ),
            ],
            bytes,
        )
            .into_response(),
        Err(_) => json_error(StatusCode::NOT_FOUND, "image not found"),
    }
}

/// Replaces every provider image URL in a JSON answer with this server's path
/// for it, so no client is handed an address that makes its device ask the
/// provider.
pub async fn serve_art(State(state): State<SharedState>, req: Request, next: Next) -> Response {
    let res = next.run(req).await;
    let json = res
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("application/json"));
    if !json {
        return res;
    }
    let (mut parts, body) = res.into_parts();
    let Ok(bytes) = to_bytes(body, usize::MAX).await else {
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "response body failed");
    };
    let rewritten = std::str::from_utf8(&bytes)
        .ok()
        .and_then(|text| remote_art::rewrite(&state.media_ticket_key, text));
    let Some(text) = rewritten else {
        return Response::from_parts(parts, Body::from(bytes));
    };
    parts.headers.remove(header::CONTENT_LENGTH);
    Response::from_parts(parts, Body::from(text))
}
