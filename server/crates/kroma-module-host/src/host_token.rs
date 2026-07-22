//! The shared-host-token guard, in one place.
//!
//! Every hop of the module IPC authenticates with the SAME random token the
//! supervisor mints at boot: the core's `/api/_host/*` callbacks, the core's
//! `/_host/register-job` endpoint, and a sidecar's `/_job/run/*` + `/_port/*`
//! routes. The guard used to be copy-pasted into each of those crates; it lives
//! here instead, in the host seam they all already depend on.

use axum::extract::{Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

/// Middleware state for [`require_host_token`]: the shared host token. Pass it to
/// `axum::middleware::from_fn_with_state` alongside [`require_host_token`].
#[derive(Clone)]
pub struct HostToken(pub String);

/// Reject a request whose bearer does not match the shared host token.
pub async fn require_host_token(
    State(token): State<HostToken>,
    headers: HeaderMap,
    req: Request,
    next: Next,
) -> Response {
    let ok = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .is_some_and(|t| ct_eq(t.as_bytes(), token.0.as_bytes()));
    if ok {
        next.run(req).await
    } else {
        (StatusCode::UNAUTHORIZED, "bad host token").into_response()
    }
}

/// Constant-time byte comparison, so matching the shared host token never leaks a
/// shared prefix through timing.
fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b) {
        diff |= x ^ y;
    }
    diff == 0
}
