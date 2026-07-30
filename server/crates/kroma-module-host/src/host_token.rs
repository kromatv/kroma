//! The shared-host-token guard.
//!
//! Every hop of the module IPC authenticates with the SAME random token the
//! supervisor mints at boot: the core's `/api/_host/*` callbacks, the core's
//! `/_host/register-job` endpoint, and a sidecar's `/_job/run/*` + `/_port/*`
//! routes. It lives in the host seam they all already depend on.

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

// Constant-time, so matching the shared host token never leaks a shared
// prefix through timing.
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

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::middleware::from_fn_with_state;
    use axum::routing::get;
    use axum::Router;
    use tower::ServiceExt as _;

    use super::*;

    const TOKEN: &str = "s3cret-host-token";

    fn guarded() -> Router {
        Router::new()
            .route("/_host/ping", get(|| async { "pong" }))
            .layer(from_fn_with_state(HostToken(TOKEN.to_string()), require_host_token))
    }

    async fn call(auth: Option<&str>) -> StatusCode {
        let mut builder = Request::builder().uri("/_host/ping");
        if let Some(v) = auth {
            builder = builder.header(axum::http::header::AUTHORIZATION, v);
        }
        guarded().oneshot(builder.body(Body::empty()).unwrap()).await.unwrap().status()
    }

    #[tokio::test]
    async fn the_shared_token_is_let_through() {
        assert_eq!(call(Some(&format!("Bearer {TOKEN}"))).await, StatusCode::OK);
    }

    #[tokio::test]
    async fn everything_else_is_rejected() {
        // This guard is the ONLY thing standing between a local process and the
        // host callback API, which can register jobs and publish events. Each of
        // these is a way a request could look almost right.
        assert_eq!(call(None).await, StatusCode::UNAUTHORIZED, "no header at all");
        assert_eq!(call(Some("")).await, StatusCode::UNAUTHORIZED, "empty header");
        assert_eq!(call(Some(TOKEN)).await, StatusCode::UNAUTHORIZED, "no Bearer scheme");
        assert_eq!(
            call(Some(&format!("bearer {TOKEN}"))).await,
            StatusCode::UNAUTHORIZED,
            "the scheme is case-sensitive here, unlike the user-facing one",
        );
        assert_eq!(
            call(Some(&format!("Basic {TOKEN}"))).await,
            StatusCode::UNAUTHORIZED,
            "a different scheme",
        );
        assert_eq!(call(Some("Bearer ")).await, StatusCode::UNAUTHORIZED, "empty token");
    }

    #[tokio::test]
    async fn a_token_that_merely_starts_right_is_rejected() {
        // The comparison is over the WHOLE token, so a shared prefix - or a
        // token with something appended - is not close enough.
        assert_eq!(call(Some("Bearer s3cret")).await, StatusCode::UNAUTHORIZED);
        assert_eq!(
            call(Some(&format!("Bearer {TOKEN}-extra"))).await,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            call(Some(&format!("Bearer {}", &TOKEN[..TOKEN.len() - 1]))).await,
            StatusCode::UNAUTHORIZED
        );
    }

    #[test]
    fn the_comparison_is_length_checked_then_constant_time() {
        // Length first (there is nothing to leak about a wrong length), then a
        // branch-free compare over every byte so a shared PREFIX cannot be
        // discovered by timing one hop at a time.
        assert!(ct_eq(b"", b""));
        assert!(ct_eq(b"abc", b"abc"));
        assert!(!ct_eq(b"abc", b"abd"), "last byte differs");
        assert!(!ct_eq(b"abc", b"xbc"), "first byte differs");
        assert!(!ct_eq(b"abc", b"ab"), "shorter");
        assert!(!ct_eq(b"ab", b"abc"), "longer");
        // Non-UTF8 bytes compare the same way; the token is bytes, not text.
        assert!(ct_eq(&[0xff, 0x00, 0x7f], &[0xff, 0x00, 0x7f]));
        assert!(!ct_eq(&[0xff, 0x00], &[0xff, 0x01]));
    }
}
