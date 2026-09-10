//! HTTP request extractors. The `Authorization: Bearer <token>` gate lives in
//! `kroma-module-host`; re-exported here so existing call sites are unchanged.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::response::Response;
use kroma_module_host::json_error;

pub use kroma_module_host::{bearer_from_headers, AuthUser};

/// The token a request authenticated with, for the handlers that must name the
/// caller's own session rather than merely its user - revoking every *other*
/// credential, or flagging one device `current`. Rejects with the same `401` as
/// [`AuthUser`], which it is always paired with.
pub struct AuthToken(pub String);

impl<S: Send + Sync> FromRequestParts<S> for AuthToken {
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        bearer_from_headers(&parts.headers)
            .map(AuthToken)
            .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "missing bearer token"))
    }
}
