//! `GET /api/admin/network/listeners`: the sockets this server and its module
//! sidecars listen on, and whether each is reachable from the network or only
//! from this machine.

use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;

use axum::extract::State;
use axum::response::{IntoResponse, Response};
use axum::{Extension, Json};
use kroma_module_supervisor::Supervisor;
use serde::Serialize;
use serde_json::json;

use crate::api::extract::AuthUser;
use crate::model::Permission;
use crate::services::network::CORE;
use crate::state::SharedState;

const DEFAULT_HTTPS_PORT: i64 = 4443;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Protocol {
    Tcp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Exposure {
    Network,
    Loopback,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct Listener {
    owner: String,
    protocol: Protocol,
    address: String,
    port: u16,
    purpose: &'static str,
    exposure: Exposure,
}

impl Listener {
    fn tcp(owner: &str, socket: SocketAddr, purpose: &'static str) -> Self {
        Self {
            owner: owner.to_string(),
            protocol: Protocol::Tcp,
            address: socket.ip().to_string(),
            port: socket.port(),
            purpose,
            exposure: exposure_of(socket.ip()),
        }
    }
}

pub(super) async fn list(
    State(state): State<SharedState>,
    Extension(supervisor): Extension<Arc<Supervisor>>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::super::require(&user, Permission::SettingsManage)?;
    let mut listeners = vec![Listener::tcp(CORE, state.config.socket_addr(), "web")];
    if let Some(port) = https_port(&state) {
        let https = SocketAddr::new(state.config.socket_addr().ip(), port);
        listeners.push(Listener::tcp(CORE, https, "web-tls"));
    }
    listeners.extend(
        supervisor.running().into_iter().map(|(id, port)| {
            Listener::tcp(&id, SocketAddr::from(([127, 0, 0, 1], port)), "sidecar")
        }),
    );
    Ok(Json(json!({ "listeners": listeners })).into_response())
}

fn https_port(state: &SharedState) -> Option<u16> {
    let enabled = state
        .config
        .https_override
        .unwrap_or_else(|| state.settings.get_bool("httpsEnabled", false));
    if !enabled {
        return None;
    }
    let configured = state
        .settings
        .get_i64("httpsPort", DEFAULT_HTTPS_PORT)
        .clamp(1, 65535);
    Some(
        state
            .config
            .https_port_override
            .unwrap_or_else(|| u16::try_from(configured).unwrap_or(443)),
    )
}

fn exposure_of(ip: IpAddr) -> Exposure {
    if ip.is_loopback() {
        Exposure::Loopback
    } else {
        Exposure::Network
    }
}
