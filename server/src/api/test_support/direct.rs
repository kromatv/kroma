//! The direct route's requests, as a client on the network or through the
//! tunnel makes them.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};

use axum::http::StatusCode;
use serde_json::Value;

use super::{TestApp, raw};

pub const NEIGHBOUR: SocketAddr =
    SocketAddr::new(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 20)), 51000);

pub const HOUSEHOLD_PUBLIC_IP: &str = "81.2.69.160";

/// The offer, asked from loopback, which is what a proxy on the same host is.
pub async fn offer(t: &TestApp) -> Value {
    let (status, _, body) = raw(
        &t.app,
        "GET",
        "/api/server/direct",
        Some(&t.token),
        None,
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body
}

/// The offer as a caller at `client` makes it through a Cloudflare tunnel on
/// this host, which also teaches the server its public origin.
pub async fn offer_through_the_tunnel(t: &TestApp, client: &str) -> Value {
    let headers = [
        ("x-forwarded-for", client),
        ("cf-connecting-ip", client),
        ("cf-ray", "8f2b-ZRH"),
        ("x-forwarded-proto", "https"),
        ("host", "kroma.example"),
    ];
    let (status, _, body) = raw(
        &t.app,
        "GET",
        "/api/server/direct",
        Some(&t.token),
        None,
        &headers,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body
}

/// The proof route for an offer's challenge.
pub fn proof_of(offer: &Value) -> String {
    format!(
        "/api/server/direct/proof?nonce={}",
        offer["nonce"].as_str().expect("a nonce")
    )
}
