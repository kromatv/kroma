//! The modules a network decision is put to before it is applied: the order
//! the operator set, which of them are required, and how each is doing.

use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;

use crate::api::extract::AuthUser;
use crate::api::util::blocking;
use crate::model::Permission;
use crate::services::network::Placed;
use crate::state::SharedState;

pub const MAX_BODY_BYTES: usize = 16 * 1024;

const MAX_PLACED: usize = 64;

/// `GET /api/admin/network/middleware` → every middleware placed or answering,
/// in the order it is asked.
pub async fn list(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::super::require(&user, Permission::SettingsManage)?;
    let standing = tokio::task::spawn_blocking(move || state.network.middleware())
        .await
        .unwrap_or_default();
    Ok(Json(json!({ "middleware": standing })).into_response())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Order {
    middleware: Vec<Placed>,
}

/// `PUT /api/admin/network/middleware` → 204. Replaces the order whole.
pub async fn put(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    body: Bytes,
) -> Result<Response, Response> {
    super::super::require(&user, Permission::SettingsManage)?;
    let order: Order = serde_json::from_slice(&body)
        .map_err(|e| super::refused("invalid_body", &format!("not a middleware order: {e}")))?;
    if order.middleware.len() > MAX_PLACED {
        return Err(super::refused("too_many", "too many middlewares"));
    }
    blocking(move || state.network.set_middleware_order(order.middleware)).await?;
    Ok(StatusCode::NO_CONTENT.into_response())
}
