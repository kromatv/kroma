//! The picture on a provider's button: the one an admin uploaded, else the
//! logo of the provider's preset.

use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};

use super::sign_in_config;
use crate::api::util::blocking;
use crate::services::settings::Provider;
use crate::services::sso::images::read_image;
use crate::services::sso::logos::preset_logo;
use crate::state::SharedState;

/// Where a client fetches the picture of `provider`'s button, or `None` when
/// it has none and the client draws the provider's icon. The address changes
/// with the picture, so it can be cached for good.
pub(crate) fn method_image(provider: &Provider) -> Option<String> {
    let version = if !provider.image.is_empty() {
        provider.image.as_str()
    } else if preset_logo(&provider.preset).is_some() {
        provider.preset.as_str()
    } else {
        return None;
    };
    Some(format!("/api/auth/methods/{}/image?v={version}", provider.id))
}

fn image_response(bytes: Vec<u8>, media_type: &'static str) -> Response {
    (
        [
            (header::CONTENT_TYPE, media_type),
            (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
            (
                header::CONTENT_SECURITY_POLICY,
                "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            ),
        ],
        bytes,
    )
        .into_response()
}

/// `GET /api/auth/methods/:id/image` → the picture of a provider's button.
/// Public, like the button it is drawn on. An SVG is sent under a policy that
/// runs nothing in it, however it is opened.
pub async fn serve(State(state): State<SharedState>, Path(id): Path<String>) -> Response {
    let Some(provider) = sign_in_config(&state).provider(&id).cloned() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if provider.image.is_empty() {
        return match preset_logo(&provider.preset) {
            Some(svg) => image_response(svg.as_bytes().to_vec(), "image/svg+xml"),
            None => StatusCode::NOT_FOUND.into_response(),
        };
    }
    let data_dir = state.config.data_dir.clone();
    match blocking(move || Ok(read_image(&data_dir, &provider.image))).await {
        Ok(Some((bytes, media_type))) => image_response(bytes, media_type),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(resp) => resp,
    }
}
