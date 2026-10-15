//! Uniform JSON error responses.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;

/// Build a JSON error response: `{ "error": "<message>" }` with the given status.
pub use kroma_engine::json_error;

/// Localised JSON error: resolves message `key` in `locale` against the shared
/// catalogs, and carries the key itself as `code`.
pub fn lerr(locale: &str, status: StatusCode, key: &str) -> Response {
    let message = crate::i18n::t(locale, key, &[]);
    (
        status,
        Json(serde_json::json!({ "error": message, "code": key })),
    )
        .into_response()
}
