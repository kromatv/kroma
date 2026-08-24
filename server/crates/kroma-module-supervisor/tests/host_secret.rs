//! The `/_host/secret` callback: how a sidecar gets a credential the operator
//! configured, by name.
//!
//! It replaced `HostCtx::tmdb_api_key()`. The point of naming it is that the host
//! contract stops growing a method per provider, so this test is mostly about the
//! two ways that can go wrong: a name the host does not know must answer `None`
//! rather than some other secret, and the route must be behind the same token
//! guard as the rest of the callback API.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use kroma_module_host::testing::StubHost;
use tower::ServiceExt;

const TOKEN: &str = "host-token";

async fn get(host: StubHost, uri: &str, token: Option<&str>) -> (StatusCode, String) {
    let mut req = Request::builder().method("GET").uri(uri);
    if let Some(t) = token {
        req = req.header("authorization", format!("Bearer {t}"));
    }
    let res = kroma_module_supervisor::host_router::<StubHost>(TOKEN.into())
        .with_state(host)
        .oneshot(req.body(Body::empty()).unwrap())
        .await
        .unwrap();
    let status = res.status();
    let bytes = axum::body::to_bytes(res.into_body(), 64 * 1024)
        .await
        .unwrap();
    (status, String::from_utf8(bytes.to_vec()).unwrap())
}

#[tokio::test]
async fn a_configured_secret_comes_back_by_name() {
    let host = StubHost::new().with_tmdb_key("abc123");

    let (status, body) = get(host, "/_host/secret?name=tmdb", Some(TOKEN)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, r#""abc123""#);
}

// The whole reason the method is named: a host that does not know a name says so,
// and cannot accidentally hand back the one secret it does have.
#[tokio::test]
async fn a_name_the_host_does_not_know_is_null_and_not_another_secret() {
    let host = StubHost::new().with_tmdb_key("abc123");

    let (status, body) = get(host, "/_host/secret?name=invented", Some(TOKEN)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, "null");
}

#[tokio::test]
async fn a_secret_the_operator_never_set_is_null() {
    let (status, body) = get(StubHost::new(), "/_host/secret?name=tmdb", Some(TOKEN)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, "null");
}

#[tokio::test]
async fn a_caller_with_no_host_token_gets_nothing() {
    let host = StubHost::new().with_tmdb_key("abc123");

    let (status, body) = get(host, "/_host/secret?name=tmdb", None).await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert!(
        !body.contains("abc123"),
        "the secret leaked to an unauthenticated caller"
    );
}

#[tokio::test]
async fn asking_with_no_name_at_all_is_rejected() {
    let (status, _) = get(StubHost::new(), "/_host/secret", Some(TOKEN)).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

// The other half of what `tmdb_api_key` used to carry. A core fact, so it stays a
// method of its own rather than becoming a named secret.
#[tokio::test]
async fn the_metadata_language_is_served_beside_it() {
    let host = StubHost::new().with_metadata_language("fr-FR");

    let (status, body) = get(host, "/_host/metadata-language", Some(TOKEN)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, r#""fr-FR""#);
}
