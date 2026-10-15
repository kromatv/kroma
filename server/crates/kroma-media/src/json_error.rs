use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;

pub(crate) fn json_error(status: StatusCode, message: &str) -> Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}
