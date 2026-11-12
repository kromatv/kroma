//! Whether a newer server exists on the owner's channel (ADMIN-89), and the
//! restart that installing one, or the owner, asks for.

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};

use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::util::blocking;
use crate::model::Permission;
use crate::services::updates;
use crate::state::SharedState;

/// Paths are relative to the `/api/admin` nest.
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/updates", get(status))
        .route("/updates/check", post(check))
        .route("/updates/install", post(install))
        .route("/server/restart", post(restart))
}

pub async fn install(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(target): Json<updates::Target>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let result = tokio::task::spawn_blocking(move || updates::install(&state, target))
        .await
        .map_err(|_| {
            crate::api::error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Update task failed")
        })?;
    result
        .map(|status| Json(status).into_response())
        .map_err(|error| crate::api::error::json_error(StatusCode::CONFLICT, &error.to_string()))
}

/// `POST /api/admin/server/restart` → `202` before the server stops gracefully
/// and exits for its packaging to start it again; `409` with a `code` where
/// nothing would, or while an update is being applied.
pub async fn restart(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let refused = |key| lerr(super::user_locale(&user), StatusCode::CONFLICT, key);
    match blocking(move || Ok(updates::restart(&state))).await? {
        Ok(()) => Ok(StatusCode::ACCEPTED.into_response()),
        Err(updates::Refusal::Unsupported) => Err(refused("admin.serverRestartUnsupported")),
        Err(updates::Refusal::UpdateInProgress) => Err(refused("admin.serverRestartDuringUpdate")),
    }
}

/// `GET /api/admin/updates` → the running build, the last answer of the
/// owner's channel, and whether it is newer.
pub async fn status(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    Ok(Json(updates::status(&state)).into_response())
}

/// `POST /api/admin/updates/check` → ask the channel now, store the answer.
pub async fn check(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let status = blocking(move || updates::check(&state)).await?;
    Ok(Json(status).into_response())
}
