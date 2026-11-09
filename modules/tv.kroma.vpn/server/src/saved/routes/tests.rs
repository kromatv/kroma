use axum::http::StatusCode;
use kroma_module_sdk::host::testing::StubHost;
use kroma_module_sdk::host::HostCtx;
use serde_json::{json, Value};

use crate::test_support::{call, signed_in};

fn kept(host: &StubHost, servers: &[&str]) -> Vec<String> {
    let configs: Vec<String> = servers
        .iter()
        .map(|server| format!("[Interface]\nPrivateKey = k\n[Peer]\n# {server}\nPublicKey = p\nEndpoint = 192.0.2.1:51820\n"))
        .collect();
    crate::saved::add(&host.data_dir().join("vpn"), &configs).unwrap()
}

async fn put_network(host: &StubHost, id: &str, on: bool) -> (StatusCode, Value) {
    let path = format!("/vpn/saved/{id}/network");
    call(super::routes(), host, "PUT", &path, json!({ "on": on })).await
}

#[tokio::test]
async fn a_kept_config_put_in_the_router_is_listed_as_routable() {
    let host = signed_in();
    let ids = kept(&host, &["CH#3"]);

    let (status, body) = put_network(&host, &ids[0], true).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["saved"][0]["routable"], json!(true));
}

#[tokio::test]
async fn a_full_router_answers_why_and_how_many_it_holds() {
    let host = signed_in();
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
    let host = signed_in();

    let (status, _) = put_network(&host, "0123456789abcdef", true).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}
