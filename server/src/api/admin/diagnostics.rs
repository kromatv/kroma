//! Admin diagnostics API: the recent opt-in crash reports from the in-memory
//! ring (`/api/admin/diagnostics/crashes`), and the caller's own live screens,
//! each of which can be asked what it shows (`/api/admin/diagnostics/screens`).
//! Needs any admin capability.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use crate::api::error::json_error;
use crate::api::extract::AuthUser;
use crate::infra::crashbuf::CRASH_BUFFER;
use crate::infra::events::ServerEvent;
use crate::services::screens::{Refused, REPLY_TIMEOUT};
use crate::state::SharedState;

const MAX_LIMIT: usize = 200;
const DEFAULT_LIMIT: usize = 100;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/diagnostics/crashes", get(list_crashes))
        .route("/diagnostics/screens", get(list_screens))
        .route("/diagnostics/screens/{id}", post(read_screen))
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

async fn list_screens(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    let screens = state.screens.roster(&user.id);
    Ok(Json(json!({ "screens": screens })).into_response())
}

async fn read_screen(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    let mut asked = state.screens.ask(&user.id, &id).map_err(refusal)?;
    let request = ServerEvent::ScreenRequest {
        screen_id: id,
        request_id: asked.request_id().to_string(),
    };
    state.events.publish_to(&user.id, request);
    let screen = asked
        .answer(REPLY_TIMEOUT)
        .await
        .ok_or_else(|| json_error(StatusCode::GATEWAY_TIMEOUT, "the screen did not answer"))?;
    Ok(Json(screen).into_response())
}

fn refusal(refused: Refused) -> Response {
    match refused {
        Refused::Unknown => json_error(StatusCode::NOT_FOUND, "screen not found"),
        Refused::Busy => json_error(
            StatusCode::TOO_MANY_REQUESTS,
            "too many screen requests are open",
        ),
    }
}
