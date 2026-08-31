//! Top viewers: who watched most over a window.

use axum::extract::{Query, State};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::state::SharedState;

use super::WindowQuery;

const ACCOUNT_LIMIT: usize = 200;

/// `GET /api/admin/stats/top-users?days=7` → every account ranked by time
/// watched, the ones who watched nothing included.
pub async fn top_users(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Query(q): Query<WindowQuery>,
) -> Result<Response, Response> {
    super::super::require_any_admin(&user)?;
    let since = super::since(q.days, 7).unwrap_or(0);
    let users = query(&state.db, move |pool| {
        db::top_users(&pool, since, ACCOUNT_LIMIT)
    })
    .await?;
    Ok(Json(json!({ "users": users })).into_response())
}
