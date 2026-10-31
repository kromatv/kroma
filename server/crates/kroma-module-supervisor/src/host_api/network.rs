//! The network half of the callback API: a module asks the core's policy where
//! one outbound call goes, and reports the calls it made. The caller is the
//! module its token names, whatever the body says.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::{Extension, Json};
use kroma_module_host::{NetworkAsk, NetworkFlow, NetworkPolicyOf};

use super::Caller;

const MAX_FLOWS_PER_REPORT: usize = 200;

pub(super) const MAX_ASK_BYTES: usize = 4 * 1024;

pub(super) const MAX_FLOWS_BYTES: usize = 256 * 1024;

const MAX_HOST_CHARS: usize = 253;
const MAX_PURPOSE_CHARS: usize = 64;
const MAX_METHOD_CHARS: usize = 16;

pub(super) async fn decide(
    Extension(caller): Extension<Caller>,
    Extension(policy): Extension<NetworkPolicyOf>,
    Json(ask): Json<NetworkAsk>,
) -> Response {
    let Some(module) = caller.module().map(str::to_string) else {
        return unnamed();
    };
    if !well_formed(&ask) {
        return (StatusCode::BAD_REQUEST, "malformed network ask").into_response();
    }
    match tokio::task::spawn_blocking(move || policy.0.decide(&module, &ask)).await {
        Ok(answer) => Json(answer).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub(super) async fn flows(
    Extension(caller): Extension<Caller>,
    Extension(policy): Extension<NetworkPolicyOf>,
    Json(flows): Json<Vec<NetworkFlow>>,
) -> Response {
    let Some(module) = caller.module().map(str::to_string) else {
        return unnamed();
    };
    if flows.len() > MAX_FLOWS_PER_REPORT {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            "too many flows in one report",
        )
            .into_response();
    }
    match tokio::task::spawn_blocking(move || policy.0.record_flows(&module, flows)).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// The fabric token authenticates without naming a module, and a ruling or a
// flow has to belong to one.
fn unnamed() -> Response {
    (
        StatusCode::FORBIDDEN,
        "the network policy answers only a caller its token names",
    )
        .into_response()
}

fn well_formed(ask: &NetworkAsk) -> bool {
    let within = |value: &str, max: usize| !value.is_empty() && value.chars().count() <= max;
    within(&ask.host, MAX_HOST_CHARS)
        && within(&ask.purpose, MAX_PURPOSE_CHARS)
        && within(&ask.method, MAX_METHOD_CHARS)
}
