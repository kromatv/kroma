use axum::http::StatusCode;
use axum::response::Response;

use kroma_module_sdk::host::json_error;

/// A 400 carrying `reason` as the error message.
pub(crate) fn bad(reason: impl std::fmt::Display) -> Response {
    json_error(StatusCode::BAD_REQUEST, &reason.to_string())
}

/// Runs blocking work off the async runtime: its error answers 400 with the
/// message, a panic answers 500.
pub(crate) async fn run<T, F>(f: F) -> Result<T, Response>
where
    F: FnOnce() -> anyhow::Result<T> + Send + 'static,
    T: Send + 'static,
{
    match tokio::task::spawn_blocking(f).await {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(e)) => Err(bad(format!("{e:#}"))),
        Err(_) => Err(json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal error",
        )),
    }
}
