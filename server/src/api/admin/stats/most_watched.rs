//! What got watched: the titles played most over a window.

use axum::extract::{Query, State};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::state::SharedState;

use super::WindowQuery;

const ENTRIES_PER_COLUMN: usize = 20;

/// `GET /api/admin/stats/most-watched?days=30&user=` → each kind's ranking,
/// series counted as series rather than as their episodes.
pub async fn most_watched(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Query(q): Query<WindowQuery>,
) -> Result<Response, Response> {
    super::super::require_any_admin(&user)?;
    let who = super::present(q.user);
    let since = super::since(q.days, 30).unwrap_or(0);
    let columns = query(&state.db, move |pool| {
        db::most_watched(&pool, since, who.as_deref(), ENTRIES_PER_COLUMN)
    })
    .await?;
    Ok(Json(json!({ "columns": columns })).into_response())
}
