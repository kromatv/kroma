//! Files every request a client makes of this server in the network service's
//! incoming tally. A loopback caller is this machine talking to itself (a module
//! sidecar, a health probe) and is left out.

use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;

use axum::body::Body;
use axum::extract::{ConnectInfo, Request, State};
use axum::http::header::CONTENT_LENGTH;
use axum::middleware::Next;
use axum::response::Response;
use http_body_util::BodyExt;

use crate::api::accounts::user_agent;
use crate::api::util::{client_ip, tunnelled};
use crate::services::network::{via_of, Arrival, Network};
use crate::services::settings;
use crate::state::SharedState;

struct Counted {
    network: Arc<Network>,
    arrival: Arrival,
}

impl Counted {
    fn sent(&mut self, bytes: usize) {
        self.arrival.bytes_out += bytes as u64;
    }
}

impl Drop for Counted {
    fn drop(&mut self) {
        self.network.record_arrival(self.arrival.clone());
    }
}

pub(super) async fn tally(
    State(state): State<SharedState>,
    request: Request,
    next: Next,
) -> Response {
    let Some(arrival) = arrival_of(&state, &request) else {
        return next.run(request).await;
    };
    let response = next.run(request).await;
    let (parts, body) = response.into_parts();
    let mut counted = Counted {
        network: state.network.clone(),
        arrival,
    };
    let body = body.map_frame(move |frame| {
        if let Some(data) = frame.data_ref() {
            counted.sent(data.len());
        }
        frame
    });
    Response::from_parts(parts, Body::new(body))
}

fn arrival_of(state: &SharedState, request: &Request) -> Option<Arrival> {
    let ConnectInfo(peer) = request.extensions().get::<ConnectInfo<SocketAddr>>()?;
    let headers = request.headers();
    let proxies = &state.config.trusted_proxies;
    let address = canonical(client_ip(headers, peer, proxies));
    if address.parse::<IpAddr>().is_ok_and(|ip| ip.is_loopback()) {
        return None;
    }
    let local_nets = settings::local_networks(&state.settings);
    Some(Arrival {
        via: via_of(&address, tunnelled(headers, peer, proxies), &local_nets),
        address,
        user_agent: user_agent(headers).unwrap_or_default(),
        bytes_in: headers
            .get(CONTENT_LENGTH)
            .and_then(|length| length.to_str().ok())
            .and_then(|length| length.parse().ok())
            .unwrap_or(0),
        bytes_out: 0,
    })
}

fn canonical(address: String) -> String {
    match address.parse::<IpAddr>() {
        Ok(ip) => ip.to_canonical().to_string(),
        Err(_) => address,
    }
}
