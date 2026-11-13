//! The picture an admin gives a provider's button
//! (`/api/admin/sign-in/methods/:id/image`).

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::Router;

use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::sso::sign_in_config;
use crate::api::util::blocking;
use crate::i18n::ReqLocale;
use crate::model::Permission;
use crate::services::settings::{self, SignIn};
use crate::services::sso::images::{remove_image, store_image, MAX_IMAGE_BYTES};
use crate::state::SharedState;

pub(super) fn routes() -> Router<SharedState> {
    Router::new().route(
        "/sign-in/methods/{id}/image",
        post(upload)
            .delete(remove)
            .layer(DefaultBodyLimit::max(MAX_IMAGE_BYTES)),
    )
}

/// `POST /api/admin/sign-in/methods/:id/image` (body = the raw image) → 204.
/// A PNG, a JPEG, a WebP or an SVG of at most 256 KiB. `415` for anything
/// else, `404` for a provider that is not saved yet.
pub async fn upload(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    body: Bytes,
) -> Result<Response, Response> {
    crate::api::admin::require(&user, Permission::SettingsManage)?;
    let Some(provider) = sign_in_config(&state).provider(&id).cloned() else {
        return Err(lerr(loc, StatusCode::NOT_FOUND, "sso.providerUnknown"));
    };
    let data_dir = state.config.data_dir.clone();
    let stored = blocking(move || store_image(&data_dir, &body)).await?;
    let Some(name) = stored else {
        return Err(lerr(
            loc,
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "error.imageUnreadable",
        ));
    };
    settings::set_provider_image(&state.settings, &state.db, &id, &name);
    if provider.image != name {
        forget(&state, provider.image).await;
    }
    Ok(StatusCode::NO_CONTENT.into_response())
}

/// `DELETE /api/admin/sign-in/methods/:id/image` → 204. The button goes back
/// to its preset's logo, or to its icon.
pub async fn remove(
    State(state): State<SharedState>,
    ReqLocale(loc): ReqLocale,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    crate::api::admin::require(&user, Permission::SettingsManage)?;
    let Some(provider) = sign_in_config(&state).provider(&id).cloned() else {
        return Err(lerr(loc, StatusCode::NOT_FOUND, "sso.providerUnknown"));
    };
    settings::set_provider_image(&state.settings, &state.db, &id, "");
    forget(&state, provider.image).await;
    Ok(StatusCode::NO_CONTENT.into_response())
}

async fn forget(state: &SharedState, name: String) {
    let data_dir = state.config.data_dir.clone();
    let _ = blocking(move || {
        remove_image(&data_dir, &name);
        Ok(())
    })
    .await;
}

/// Deletes the pictures of providers that `before` had and the saved
/// configuration no longer does.
pub(super) async fn drop_orphans(state: &SharedState, before: &SignIn) {
    let kept: Vec<String> = sign_in_config(state)
        .providers()
        .map(|p| p.image.clone())
        .collect();
    for provider in before.providers() {
        if !provider.image.is_empty() && !kept.contains(&provider.image) {
            forget(state, provider.image.clone()).await;
        }
    }
}
