use axum::body::Body;
use axum::http::{Request, StatusCode};
use kroma_module_sdk::domain::{LibraryScope, Permission, User};
use kroma_module_sdk::host::testing::StubHost;
use kroma_module_sdk::host::HostCtx;
use serde_json::{json, Value};
use tower::ServiceExt as _;

const TOKEN: &str = "admin";

fn admin() -> User {
    User {
        id: "u1".into(),
        email: "a@b.c".into(),
        username: "ana".into(),
        avatar_url: None,
        language: None,
        audio_language: None,
        subtitle_language: None,
        permissions: vec![Permission::SettingsManage],
        libraries: LibraryScope::All,
        created_at: "2024-01-01T00:00:00Z".into(),
        has_pin: false,
    }
}

fn host() -> StubHost {
    StubHost::new().with_session(TOKEN, admin())
}

fn kept(host: &StubHost, servers: &[&str]) -> Vec<String> {
    let configs: Vec<String> = servers
        .iter()
        .map(|server| format!("[Interface]\nPrivateKey = k\n[Peer]\n# {server}\nPublicKey = p\nEndpoint = 192.0.2.1:51820\n"))
        .collect();
    crate::saved::add(&host.data_dir().join("vpn"), &configs).unwrap()
}

async fn put_network(host: &StubHost, id: &str, on: bool) -> (StatusCode, Value) {
    let request = Request::builder()
        .method("PUT")
        .uri(format!("/vpn/saved/{id}/network"))
        .header("authorization", format!("Bearer {TOKEN}"))
        .header("content-type", "application/json")
        .body(Body::from(json!({ "on": on }).to_string()))
        .unwrap();
    let response = super::routes::<StubHost>()
        .with_state(host.clone())
        .oneshot(request)
        .await
        .unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

#[tokio::test]
async fn a_kept_config_put_in_the_router_is_listed_as_routable() {
    let host = host();
    let ids = kept(&host, &["CH#3"]);

    let (status, body) = put_network(&host, &ids[0], true).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["saved"][0]["routable"], json!(true));
}

#[tokio::test]
async fn a_full_router_answers_why_and_how_many_it_holds() {
    let host = host();
    let ids = kept(&host, &["CH#1", "CH#2", "CH#3", "CH#4", "CH#5"]);
    for id in &ids[..4] {
        put_network(&host, id, true).await;
    }

    let (status, body) = put_network(&host, &ids[4], true).await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body, json!({ "code": "routerFull", "max": 4 }));
}

#[tokio::test]
async fn a_config_that_is_not_kept_is_not_found() {
    let host = host();

    let (status, _) = put_network(&host, "0123456789abcdef", true).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}
