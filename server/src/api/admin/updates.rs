//! Whether a newer server exists on the owner's channel (ADMIN-89).

use axum::extract::State;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};

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
            crate::api::error::json_error(
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Update task failed",
            )
        })?;
    result
        .map(|status| Json(status).into_response())
        .map_err(|error| {
            crate::api::error::json_error(axum::http::StatusCode::CONFLICT, &error.to_string())
        })
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
