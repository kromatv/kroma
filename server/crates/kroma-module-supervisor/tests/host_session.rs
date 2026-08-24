//! The `/_host/session` callback: how a sidecar authenticates the caller of one
//! of its routes now that it has no `sessions` table to read.
//!
//! Every authenticated module request goes through this, so its wire shape (a
//! POSTed token in, the whole `User` or `null` out) and its guard are what the
//! `AuthUser` extractor on the other side depends on.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use kroma_domain::User;
use kroma_module_host::testing::StubHost;
use tower::ServiceExt;

const TOKEN: &str = "host-token";

fn ana() -> User {
    User {
        id: "u1".into(),
        email: "ana@t.dev".into(),
        username: "ana".into(),
        avatar_url: None,
        language: None,
        audio_language: None,
        subtitle_language: None,
        permissions: Vec::new(),
        created_at: "2024-01-01T00:00:00Z".into(),
        has_pin: false,
    }
}

fn app(host: StubHost) -> axum::Router {
    kroma_module_supervisor::host_router::<StubHost>(TOKEN.into()).with_state(host)
}

async fn post(host: StubHost, token: Option<&str>, body: &str) -> (StatusCode, String) {
    let mut req = Request::builder().method("POST").uri("/_host/session");
    if let Some(t) = token {
        req = req.header("authorization", format!("Bearer {t}"));
    }
    let res = app(host)
        .oneshot(
            req.header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = res.status();
    let bytes = axum::body::to_bytes(res.into_body(), 64 * 1024)
        .await
        .unwrap();
    (status, String::from_utf8(bytes.to_vec()).unwrap())
}

#[tokio::test]
async fn a_live_token_comes_back_as_the_whole_account() {
    // The whole `User`, because the sidecar gates on its permissions and
    // localizes for it; a bare id would cost a second round-trip per request.
    let host = StubHost::new().with_session("sess-1", ana());
    let (status, body) = post(host, Some(TOKEN), r#"{"token":"sess-1"}"#).await;

    assert_eq!(status, StatusCode::OK);
    let user: User = serde_json::from_str(&body).expect("a User came back");
    assert_eq!(user.id, "u1");
    assert_eq!(user.username, "ana");
}

#[tokio::test]
async fn an_unknown_token_is_null_rather_than_an_error() {
    // `OptionalAuthUser` never rejects, so "no session" has to be a value.
    let host = StubHost::new().with_session("sess-1", ana());
    let (status, body) = post(host, Some(TOKEN), r#"{"token":"not-a-session"}"#).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, "null");
}

#[tokio::test]
async fn the_callback_is_behind_the_host_token_like_every_other() {
    // Without this, anything on the box could turn a stolen session token into
    // the account behind it.
    let host = StubHost::new().with_session("sess-1", ana());
    let (status, _) = post(host.clone(), None, r#"{"token":"sess-1"}"#).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (status, _) = post(host, Some("wrong"), r#"{"token":"sess-1"}"#).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
