//! Uniform JSON error responses.

use axum::http::StatusCode;
use axum::response::Response;

/// Build a JSON error response: `{ "error": "<message>" }` with the given status.
pub use kroma_engine::json_error;

/// Localised JSON error: resolves message `key` in `locale` against the shared
/// catalogs.
pub fn lerr(locale: &str, status: StatusCode, key: &str) -> Response {
    json_error(status, &crate::i18n::t(locale, key, &[]))
}
