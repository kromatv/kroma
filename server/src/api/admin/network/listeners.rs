//! `GET /api/admin/network/listeners`: the sockets this server and its module
//! sidecars listen on, and whether each is reachable from the network or only
//! from this machine.

use std::net::{IpAddr, SocketAddr};
use std::path::Path;
use std::sync::Arc;

use axum::extract::State;
use axum::response::{IntoResponse, Response};
use axum::{Extension, Json};
use kroma_module_supervisor::{Endpoint, Supervisor};
use serde::Serialize;
use serde_json::json;

use crate::api::extract::AuthUser;
use crate::boot::https::https_port;
use crate::model::Permission;
use crate::services::network::CORE;
use crate::state::SharedState;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Protocol {
    Tcp,
    Unix,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    port: Option<u16>,
    purpose: &'static str,
    exposure: Exposure,
}

impl Listener {
    fn tcp(owner: &str, socket: SocketAddr, purpose: &'static str) -> Self {
        Self {
            owner: owner.to_string(),
            protocol: Protocol::Tcp,
            address: socket.ip().to_string(),
            port: Some(socket.port()),
            purpose,
            exposure: exposure_of(socket.ip()),
        }
    }

    fn unix(owner: &str, socket: &Path, purpose: &'static str) -> Self {
        Self {
            owner: owner.to_string(),
            protocol: Protocol::Unix,
            address: socket.display().to_string(),
            port: None,
            purpose,
            exposure: Exposure::Loopback,
        }
    }

    fn module(id: &str, endpoint: &Endpoint) -> Self {
        match endpoint {
            Endpoint::Unix(socket) => Self::unix(id, socket, "sidecar"),
            Endpoint::Tcp(port) => {
                Self::tcp(id, SocketAddr::from(([127, 0, 0, 1], *port)), "legacy-seam")
            }
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
    if cfg!(unix) {
        listeners.push(Listener::unix(CORE, &supervisor.host_socket(), "seam"));
    }
    listeners.extend(
        supervisor
            .running()
            .iter()
            .map(|(id, endpoint)| Listener::module(id, endpoint)),
    );
    Ok(Json(json!({ "listeners": listeners })).into_response())
}

fn exposure_of(ip: IpAddr) -> Exposure {
    if ip.is_loopback() {
        Exposure::Loopback
    } else {
        Exposure::Network
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_module_on_its_socket_is_listed_by_path_as_reachable_from_this_machine_only() {
        let socket = Endpoint::Unix("/data/run/modules/tv.kroma.vpn/module.sock".into());

        let listener = Listener::module("tv.kroma.vpn", &socket);

        assert_eq!(
            serde_json::to_value(listener).unwrap(),
            json!({
                "owner": "tv.kroma.vpn", "protocol": "unix",
                "address": "/data/run/modules/tv.kroma.vpn/module.sock",
                "purpose": "sidecar", "exposure": "loopback"
            })
        );
    }

    #[test]
    fn a_module_on_the_legacy_seam_is_listed_on_its_loopback_port() {
        let listener = Listener::module("com.example.old", &Endpoint::Tcp(41234));

        assert_eq!(
            serde_json::to_value(listener).unwrap(),
            json!({
                "owner": "com.example.old", "protocol": "tcp", "address": "127.0.0.1",
                "port": 41234, "purpose": "legacy-seam", "exposure": "loopback"
            })
        );
    }
}
