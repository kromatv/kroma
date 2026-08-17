//! Admin diagnostics API (`/api/admin/diagnostics/crashes`): the recent opt-in
//! crash reports from the in-memory ring, backing the admin crash view.
//! Read-only; needs any admin capability.

use axum::extract::State;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use crate::api::extract::AuthUser;
use crate::infra::crashbuf::CRASH_BUFFER;
use crate::state::SharedState;

const MAX_LIMIT: usize = 200;
const DEFAULT_LIMIT: usize = 100;

pub fn routes() -> Router<SharedState> {
    Router::new().route("/diagnostics/crashes", get(list_crashes))
}

#[derive(Deserialize)]
struct CrashesQuery {
    limit: Option<usize>,
}

async fn list_crashes(
    State(_state): State<SharedState>,
    AuthUser(user): AuthUser,
    axum::extract::Query(query): axum::extract::Query<CrashesQuery>,
) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    let limit = query.limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT);
    Ok(Json(json!({ "crashes": CRASH_BUFFER.snapshot(limit) })).into_response())
}
