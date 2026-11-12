use std::net::{IpAddr, Ipv4Addr, SocketAddr};

use axum::http::StatusCode;
use serde_json::json;

use crate::api::test_support::{NEIGHBOUR, get, get_from, offer, proof_of, raw, test_app};

const UNNAMED_PROXY: SocketAddr = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(172, 18, 0, 2)), 51000);

const THROUGH_THE_TUNNEL: &[(&str, &str)] = &[
    ("x-forwarded-for", "203.0.113.7"),
    ("cf-connecting-ip", "203.0.113.7"),
    ("cf-ray", "8f2b-ZRH"),
    ("x-forwarded-proto", "https"),
    ("host", "kroma.example"),
];

#[tokio::test]
async fn an_anonymous_caller_is_offered_nothing() {
    let t = test_app();

    let (status, _) = get(&t.app, "/api/server/direct", None).await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn a_signed_in_caller_is_offered_this_servers_private_addresses_and_a_challenge() {
    let t = test_app();

    let body = offer(&t).await;

    assert_eq!(body["instanceId"], json!(t.state.instance_id));
    for route in body["routes"].as_array().expect("routes") {
        let host = route
            .as_str()
            .and_then(|r| r.strip_prefix("http://"))
            .and_then(|r| r.strip_suffix(":0"))
            .expect("http://<address>:<port>");
        assert!(host.parse::<Ipv4Addr>().unwrap().is_private(), "{route}");
    }
    assert_eq!(body["nonce"].as_str().unwrap().len(), 64);
    assert_ne!(body["nonce"], body["answer"]);
}

#[tokio::test]
async fn a_neighbour_is_answered_once() {
    let t = test_app();
    let offer = offer(&t).await;

    let (first, _, answer) = get_from(&t.app, NEIGHBOUR, &proof_of(&offer), None, &[]).await;
    let (second, _, _) = get_from(&t.app, NEIGHBOUR, &proof_of(&offer), None, &[]).await;

    assert_eq!(first, StatusCode::OK);
    assert_eq!(answer["answer"], offer["answer"]);
    assert_eq!(second, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_relay_through_the_public_route_is_told_nothing_and_spends_nothing() {
    let t = test_app();
    let offer = offer(&t).await;

    let (relayed, _, body) = raw(
        &t.app,
        "GET",
        &proof_of(&offer),
        None,
        None,
        THROUGH_THE_TUNNEL,
    )
    .await;
    let (direct, _, _) = get_from(&t.app, NEIGHBOUR, &proof_of(&offer), None, &[]).await;

    assert_eq!(relayed, StatusCode::NOT_FOUND);
    assert!(body.get("answer").is_none());
    assert_eq!(direct, StatusCode::OK);
}

#[tokio::test]
async fn this_machine_is_not_a_neighbour() {
    let t = test_app();
    let offer = offer(&t).await;

    let (status, _) = get(&t.app, &proof_of(&offer), None).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_proxy_nobody_named_is_not_mistaken_for_a_neighbour() {
    let t = test_app();
    let offer = offer(&t).await;

    let (status, _, _) = get_from(
        &t.app,
        UNNAMED_PROXY,
        &proof_of(&offer),
        None,
        &[("cf-connecting-ip", "203.0.113.7"), ("cf-ray", "8f2b-ZRH")],
    )
    .await;

    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_neighbour_behind_a_named_proxy_is_still_a_neighbour() {
    let t = test_app();
    let offer = offer(&t).await;

    let (status, _, _) = raw(
        &t.app,
        "GET",
        &proof_of(&offer),
        None,
        None,
        &[("x-forwarded-for", "192.168.1.20")],
    )
    .await;

    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn a_nonce_nobody_issued_has_no_answer() {
    let t = test_app();
    offer(&t).await;

    let (made_up, _, _) = get_from(
        &t.app,
        NEIGHBOUR,
        "/api/server/direct/proof?nonce=feed",
        None,
        &[],
    )
    .await;
    let (missing, _, _) = get_from(&t.app, NEIGHBOUR, "/api/server/direct/proof", None, &[]).await;

    assert_eq!(made_up, StatusCode::NOT_FOUND);
    assert_eq!(missing, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_caller_that_keeps_asking_for_proofs_is_throttled() {
    let t = test_app();
    let uri = "/api/server/direct/proof?nonce=feed";

    for _ in 0..30 {
        get_from(&t.app, NEIGHBOUR, uri, None, &[]).await;
    }
    let (status, _, _) = get_from(&t.app, NEIGHBOUR, uri, None, &[]).await;

    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
}
