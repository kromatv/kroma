//! The mark and the look of a provider's button, for a provider the server
//! knows by name.

use axum::extract::Path;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::api::dto::{BrandView, LookView, PresetView};
use crate::services::settings::Provider;
use crate::services::sso::presets::{mark, preset, presets, Brand, Look};

/// Where a client fetches the mark filed under `name`. The address changes
/// with the file, so a browser never draws a mark the server has replaced.
fn mark_url(name: &str) -> Option<String> {
    mark(name).map(|mark| format!("/api/auth/logos/{name}.svg?v={}", mark.version))
}

fn look_view(look: &Look) -> Option<LookView> {
    Some(LookView {
        fill: look.fill.clone(),
        stroke: look.stroke.clone(),
        ink: look.ink.clone(),
        logo: mark_url(&look.mark)?,
    })
}

fn brand_view(brand: &Brand) -> Option<BrandView> {
    Some(BrandView {
        dark: look_view(&brand.dark)?,
        light: look_view(&brand.light)?,
    })
}

/// Where a client fetches the mark of `provider`, to draw where its button is
/// not. `None` for a provider with no preset, and the client draws its icon.
pub(crate) fn method_image(provider: &Provider) -> Option<String> {
    preset(&provider.preset).and_then(|preset| mark_url(&preset.mark))
}

/// How `provider`'s button is painted. `None` for a provider whose preset
/// asks for nothing, and the button looks like the others on the screen.
pub(crate) fn method_brand(provider: &Provider) -> Option<BrandView> {
    preset(&provider.preset)
        .and_then(|preset| preset.brand.as_ref())
        .and_then(brand_view)
}

/// Every preset as the admin page offers it: what the form starts with, the
/// two links that help set the provider up, and the button it will draw.
pub(crate) fn preset_views() -> Vec<PresetView> {
    presets()
        .iter()
        .filter_map(|preset| {
            Some(PresetView {
                id: preset.id.clone(),
                name: preset.name.clone(),
                label: preset.label.clone(),
                icon: preset.icon.clone(),
                issuer: preset.issuer.clone(),
                scopes: preset.scopes.clone(),
                group_claim: preset.group_claim.clone(),
                console: preset.console.clone(),
                docs: preset.docs.clone(),
                logo: mark_url(&preset.mark)?,
                brand: preset.brand.as_ref().and_then(brand_view),
            })
        })
        .collect()
}

/// `GET /api/auth/logos/:preset/:name.svg` → a mark the server has on file.
/// Public, like the button it is drawn on, and sent under a policy that runs
/// nothing in it, however it is opened.
pub async fn logo(Path((preset, file)): Path<(String, String)>) -> Response {
    let found = file
        .strip_suffix(".svg")
        .and_then(|name| mark(&format!("{preset}/{name}")));
    let Some(found) = found else {
        return StatusCode::NOT_FOUND.into_response();
    };
    (
        [
            (header::CONTENT_TYPE, "image/svg+xml"),
            (header::CACHE_CONTROL, "public, max-age=86400"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
            (
                header::CONTENT_SECURITY_POLICY,
                "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            ),
        ],
        found.svg,
    )
        .into_response()
}
