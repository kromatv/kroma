//! `/api/diagnostics/crash`: opt-in crash reporting ingestion. A client whose
//! user enabled crash reporting posts an uncaught crash here; the report lands
//! in the bounded [`CRASH_BUFFER`] ring and is readable by admins at
//! `/api/admin/diagnostics/crashes`. Public (a crashing client may have no live
//! session) but body-size and rate limited, and it stores no caller identity.

use axum::extract::DefaultBodyLimit;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router};
use serde_json::json;

use crate::api::error::json_error;
use crate::infra::crashbuf::CRASH_BUFFER;
use crate::model::CrashReportBody;
use crate::state::SharedState;

const MAX_CRASH_BYTES: usize = 64 * 1024;

pub fn routes() -> Router<SharedState> {
    Router::new().route(
        "/diagnostics/crash",
        post(ingest).layer(DefaultBodyLimit::max(MAX_CRASH_BYTES)),
    )
}

async fn ingest(Json(body): Json<CrashReportBody>) -> Result<Response, Response> {
    if body.message.trim().is_empty() {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "crash message is required",
        ));
    }
    match CRASH_BUFFER.record(body) {
        Some(_) => Ok((StatusCode::ACCEPTED, Json(json!({ "ok": true }))).into_response()),
        None => Err(json_error(
            StatusCode::TOO_MANY_REQUESTS,
            "too many crash reports",
        )),
    }
}
