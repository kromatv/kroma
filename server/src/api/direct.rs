//! The route straight to this server across the household's network: the offer a
//! signed-in client asks for over its usual route, and the proof a candidate
//! route has to answer. See `docs/direct-connection.md`.

use std::net::{IpAddr, SocketAddr};

use axum::extract::{ConnectInfo, Query, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::api::error::json_error;
use crate::api::util::{client_ip, trusted};
use crate::services::direct::{Asker, is_private_client};
use crate::state::SharedState;

// What a hop between the client and this server writes. A request on a direct
// route has none, so one carrying any of them from a peer nobody named came
// through a proxy the server cannot see through.
const FORWARDING_HEADERS: &[&str] = &[
    "forwarded",
    "via",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-real-ip",
    "cf-connecting-ip",
    "cf-ray",
];

/// The proof a candidate route answers. Public: the client asks it before it
/// trusts the route with a bearer.
pub fn public_routes() -> Router<SharedState> {
    Router::new().route("/server/direct/proof", get(proof))
}

/// The offer. Gated by the session middleware in [`super`].
pub fn routes() -> Router<SharedState> {
    Router::new().route("/server/direct", get(offer))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Offer {
    instance_id: String,
    routes: Vec<String>,
    nonce: String,
    answer: String,
    same_network: bool,
}

#[derive(Deserialize)]
struct ProofQuery {
    #[serde(default)]
    nonce: String,
}

#[derive(Serialize)]
struct Proof {
    answer: String,
}

async fn offer(
    State(state): State<SharedState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Response {
    let proxies = &state.config.trusted_proxies;
    if trusted(addr.ip(), proxies) && forwarded_over_https(&headers) {
        if let Some(host) = headers.get(header::HOST).and_then(|v| v.to_str().ok()) {
            state.direct.origins().learn(host);
        }
    }
    let asker = Asker {
        bind: state.config.socket_addr().ip(),
        port: state.config.port,
        client: resolved_client(&headers, &addr, proxies),
    };
    let offer = state.direct.offer(&state.settings, asker).await;
    Json(Offer {
        instance_id: state.instance_id.clone(),
        routes: offer.routes,
        nonce: offer.challenge.nonce,
        answer: offer.challenge.answer,
        same_network: offer.same_network,
    })
    .into_response()
}

// A relay elsewhere that forwards the nonce through the public route arrives
// from a public address, so only a request that crossed this machine's own
// network is told the answer.
async fn proof(
    State(state): State<SharedState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(query): Query<ProofQuery>,
) -> Response {
    let proxies = &state.config.trusted_proxies;
    let client = resolved_client(&headers, &addr, proxies);
    if !state.direct.admit_proof(&client.to_string()) {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    }
    let unseen_proxy = !trusted(addr.ip(), proxies)
        && FORWARDING_HEADERS
            .iter()
            .any(|name| headers.contains_key(*name));
    let answer = (is_private_client(client) && !unseen_proxy)
        .then(|| state.direct.redeem(&query.nonce))
        .flatten();
    match answer {
        Some(answer) => Json(Proof { answer }).into_response(),
        None => json_error(StatusCode::NOT_FOUND, "no such challenge"),
    }
}

fn resolved_client(headers: &HeaderMap, addr: &SocketAddr, proxies: &[String]) -> IpAddr {
    client_ip(headers, addr, proxies)
        .parse()
        .unwrap_or(addr.ip())
}

fn forwarded_over_https(headers: &HeaderMap) -> bool {
    headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .is_some_and(|proto| proto.trim().eq_ignore_ascii_case("https"))
}
