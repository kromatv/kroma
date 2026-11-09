use axum::http::StatusCode;
use kroma_module_sdk::host::HostCtx;
use serde_json::json;

use crate::test_support::{call, signed_in};

const PLACE: &str = "/vpn/mullvad/router";

#[tokio::test]
async fn adding_a_place_without_a_mullvad_device_asks_for_an_account() {
    let host = signed_in();

    let (status, body) = call(
        super::routes(),
        &host,
        "POST",
        PLACE,
        json!({ "country": "se" }),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body, json!({ "code": "accountNeeded" }));
}

#[tokio::test]
async fn a_full_router_refuses_a_place_before_asking_mullvad() {
    let host = signed_in();
    let dir = host.data_dir().join("vpn");
    let configs: Vec<String> = (1..=4)
        .map(|n| format!("[Interface]\nPrivateKey = k{n}\n[Peer]\nPublicKey = p\n"))
        .collect();
    for id in crate::saved::add(&dir, &configs).unwrap() {
        crate::saved::set_routable(&dir, &id, true).unwrap();
    }

    let (status, body) = call(
        super::routes(),
        &host,
        "POST",
        PLACE,
        json!({ "country": "se" }),
    )
    .await;

    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body, json!({ "code": "routerFull", "max": 4 }));
}
