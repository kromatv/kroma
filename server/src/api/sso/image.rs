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

/// Where a client fetches the picture of `provider`'s button: the one an
/// admin uploaded, else its preset's logo. `None` when it has neither and the
/// client draws the provider's icon. An upload's address changes with the
/// picture, so both can be cached for good.
pub(crate) fn method_image(provider: &Provider) -> Option<String> {
    if !provider.image.is_empty() {
        return Some(format!(
            "/api/auth/methods/{}/image?v={}",
            provider.id, provider.image
        ));
    }
    preset_logo(&provider.preset).map(|_| format!("/api/auth/logos/{}", provider.preset))
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

/// `GET /api/auth/methods/:id/image` → the picture an admin uploaded for a
/// provider's button. Public, like the button it is drawn on. An SVG is sent
/// under a policy that runs nothing in it, however it is opened.
pub async fn serve(State(state): State<SharedState>, Path(id): Path<String>) -> Response {
    let name = sign_in_config(&state)
        .provider(&id)
        .map(|provider| provider.image.clone())
        .unwrap_or_default();
    let data_dir = state.config.data_dir.clone();
    match blocking(move || Ok(read_image(&data_dir, &name))).await {
        Ok(Some((bytes, media_type))) => image_response(bytes, media_type),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(resp) => resp,
    }
}

/// `GET /api/auth/logos/:preset` → the logo of a provider this server knows by
/// name.
pub async fn logo(Path(preset): Path<String>) -> Response {
    match preset_logo(&preset) {
        Some(svg) => image_response(svg.as_bytes().to_vec(), "image/svg+xml"),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}
