//! The axum request guards a module's routes use: an authenticated caller
//! resolved through the host's session seam, and the bearer-token reader.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::response::Response;

use kroma_domain::User;

use super::{json_error, HostCtx};

/// An authenticated user, resolved from an `Authorization: Bearer <token>`
/// header through [`HostCtx::session_user`]. A missing, expired or unknown token
/// yields `401`.
pub struct AuthUser(pub User);

// Resolution is blocking, so it runs on a blocking thread and the state has to
// be owned there -- which is why these two want `Clone`. Every router state
// already is one (axum requires it).
async fn resolve_session<S: HostCtx + Clone>(parts: &Parts, state: &S) -> Option<User> {
    let token = bearer_from_headers(&parts.headers)?;
    let state = state.clone();
    tokio::task::spawn_blocking(move || state.session_user(&token)).await.ok().flatten()
}

impl<S: HostCtx + Clone> FromRequestParts<S> for AuthUser {
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        if bearer_from_headers(&parts.headers).is_none() {
            return Err(json_error(StatusCode::UNAUTHORIZED, "missing bearer token"));
        }
        let user = resolve_session(parts, state)
            .await
            .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "invalid or expired session"))?;
        Ok(AuthUser(user))
    }
}

/// `Some(user)` for a valid Bearer token, `None` otherwise. Never rejects, for
/// endpoints that are public but personalise when signed in.
pub struct OptionalAuthUser(pub Option<User>);

impl<S: HostCtx + Clone> FromRequestParts<S> for OptionalAuthUser {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        Ok(OptionalAuthUser(resolve_session(parts, state).await))
    }
}

pub fn bearer_from_headers(headers: &axum::http::HeaderMap) -> Option<String> {
    let h = headers.get(axum::http::header::AUTHORIZATION)?;
    let s = h.to_str().ok()?;
    s.strip_prefix("Bearer ")
        .or_else(|| s.strip_prefix("bearer "))
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::testing;

    #[test]
    fn bearer_from_headers_extracts_case_insensitively_and_trims() {
        use axum::http::{header::AUTHORIZATION, HeaderMap, HeaderValue};

        let mut h = HeaderMap::new();
        h.insert(AUTHORIZATION, HeaderValue::from_static("Bearer abc123"));
        assert_eq!(bearer_from_headers(&h).as_deref(), Some("abc123"));

        let mut h = HeaderMap::new();
        h.insert(AUTHORIZATION, HeaderValue::from_static("bearer   tok  "));
        assert_eq!(bearer_from_headers(&h).as_deref(), Some("tok"));

        assert!(bearer_from_headers(&HeaderMap::new()).is_none());

        let mut h = HeaderMap::new();
        h.insert(AUTHORIZATION, HeaderValue::from_static("Basic Zm9v"));
        assert!(bearer_from_headers(&h).is_none());

        let mut h = HeaderMap::new();
        h.insert(AUTHORIZATION, HeaderValue::from_static("Bearer    "));
        assert!(bearer_from_headers(&h).is_none());
    }

    #[tokio::test]
    async fn optional_auth_is_none_when_the_request_carries_no_bearer() {
        let (mut parts, ()) = axum::http::Request::builder().body(()).unwrap().into_parts();
        let host = testing::StubHost::new();
        let OptionalAuthUser(user) =
            OptionalAuthUser::from_request_parts(&mut parts, &host).await.unwrap();
        assert!(user.is_none(), "a public endpoint must not reject an anonymous caller");
    }

    fn bearer(token: &str) -> Parts {
        axum::http::Request::builder()
            .header(axum::http::header::AUTHORIZATION, format!("Bearer {token}"))
            .body(())
            .unwrap()
            .into_parts()
            .0
    }

    fn someone() -> User {
        User {
            id: "u1".into(),
            email: "ana@t.dev".into(),
            username: "ana".into(),
            avatar_url: None,
            language: None,
            audio_language: None,
            subtitle_language: None,
            permissions: Vec::new(),
            created_at: "now".into(),
            has_pin: false,
        }
    }

    #[tokio::test]
    async fn both_extractors_resolve_through_the_host_rather_than_a_database() {
        let host = testing::StubHost::new().with_session("live", someone());

        let AuthUser(user) = AuthUser::from_request_parts(&mut bearer("live"), &host).await.unwrap();
        assert_eq!(user.id, "u1");

        let OptionalAuthUser(user) =
            OptionalAuthUser::from_request_parts(&mut bearer("live"), &host).await.unwrap();
        assert_eq!(user.map(|u| u.id).as_deref(), Some("u1"));
    }

    #[tokio::test]
    async fn a_token_the_host_does_not_know_is_a_401_and_not_a_500() {
        let host = testing::StubHost::new().with_session("live", someone());

        // `AuthUser` is not Debug, so map the Ok side away before unwrapping.
        let status = |r: Result<AuthUser, Response>| r.map(|_| ()).unwrap_err().status();
        assert_eq!(
            status(AuthUser::from_request_parts(&mut bearer("stale"), &host).await),
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            status(
                AuthUser::from_request_parts(
                    &mut axum::http::Request::builder().body(()).unwrap().into_parts().0,
                    &host,
                )
                .await
            ),
            StatusCode::UNAUTHORIZED
        );

        let OptionalAuthUser(user) =
            OptionalAuthUser::from_request_parts(&mut bearer("stale"), &host).await.unwrap();
        assert!(user.is_none());
    }

    #[test]
    fn a_bearer_token_is_read_case_insensitively_and_trimmed() {
        let header = |v: &str| {
            let mut h = axum::http::HeaderMap::new();
            h.insert(axum::http::header::AUTHORIZATION, v.parse().unwrap());
            h
        };
        assert_eq!(bearer_from_headers(&header("Bearer abc123")).as_deref(), Some("abc123"));
        assert_eq!(bearer_from_headers(&header("bearer abc123")).as_deref(), Some("abc123"));
        assert_eq!(bearer_from_headers(&header("Bearer   abc123  ")).as_deref(), Some("abc123"));
    }

    #[test]
    fn anything_that_is_not_a_bearer_token_is_no_token() {
        // An empty token must not read as valid, or `Authorization: Bearer `
        // would look authenticated to the session lookup.
        let header = |v: &str| {
            let mut h = axum::http::HeaderMap::new();
            h.insert(axum::http::header::AUTHORIZATION, v.parse().unwrap());
            h
        };
        assert!(bearer_from_headers(&header("Bearer ")).is_none());
        assert!(bearer_from_headers(&header("Bearer    ")).is_none());
        assert!(bearer_from_headers(&header("Basic dXNlcjpwYXNz")).is_none());
        assert!(bearer_from_headers(&header("abc123")).is_none(), "a bare token is not a bearer");
        assert!(bearer_from_headers(&axum::http::HeaderMap::new()).is_none());
    }
}
