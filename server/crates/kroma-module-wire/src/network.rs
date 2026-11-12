//! What a module asks the core before an outbound call, what the core answers,
//! and the record of each call the module reports afterwards. A host and a
//! port, never a URL: the path and query are where credentials travel.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkAsk {
    pub purpose: String,
    pub method: String,
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub https: bool,
    /// The caller asks for the VPN whatever the rules say, and for a refusal
    /// when no VPN answers.
    #[serde(default)]
    pub sealed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NetworkAction {
    Direct,
    Vpn,
    Block,
}

/// The core's ruling on a [`NetworkAsk`]. `proxy` is the SOCKS5 URL to use
/// when `action` is [`NetworkAction::Vpn`]; `reason` says why when it is
/// [`NetworkAction::Block`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkAnswer {
    pub action: NetworkAction,
    #[serde(default)]
    pub proxy: Option<String>,
    #[serde(default)]
    pub rule: Option<String>,
    #[serde(default)]
    pub reason: Option<String>,
    /// The name may resolve to a private address, because someone named this
    /// destination. Otherwise every address it resolves to must be public.
    #[serde(default)]
    pub private_allowed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NetworkRoute {
    Direct,
    Proxy,
    Blocked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkFlow {
    pub purpose: String,
    pub method: String,
    pub host: String,
    pub port: u16,
    pub route: NetworkRoute,
    pub status: Option<u16>,
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub duration_ms: u64,
    pub error: Option<String>,
    pub rule: Option<String>,
    /// The gateway carried this call and has already filed the connection, so
    /// this report only adds the method and the status it cannot see.
    #[serde(default)]
    pub carried: bool,
}

/// One way out a module runs, as it answers the core-called point `network`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkOffer {
    /// What rules refer to. Unique across providers: the first one keeps it.
    pub name: String,
    #[serde(default)]
    pub label: String,
    pub endpoint: NetworkEndpoint,
    #[serde(default)]
    pub carries: NetworkCarries,
    pub health: NetworkHealth,
}

/// A SOCKS5 server only the gateway dials.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkEndpoint {
    pub address: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
}

impl std::fmt::Debug for NetworkEndpoint {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NetworkEndpoint")
            .field("address", &self.address)
            .finish_non_exhaustive()
    }
}

impl NetworkEndpoint {
    /// This endpoint as a SOCKS5 URL.
    pub fn url(&self) -> String {
        match (&self.username, &self.password) {
            (Some(username), Some(password)) => {
                format!("socks5://{username}:{password}@{}", self.address)
            }
            _ => format!("socks5://{}", self.address),
        }
    }
}

/// `dns` means the network resolves a name it is handed, which keeps DNS inside
/// the tunnel.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct NetworkCarries {
    pub tcp: bool,
    pub udp: bool,
    pub dns: bool,
}

impl Default for NetworkCarries {
    fn default() -> Self {
        Self {
            tcp: true,
            udp: false,
            dns: false,
        }
    }
}

/// A network that is not `up` refuses every connection routed to it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkHealth {
    pub up: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit: Option<String>,
}

/// What a module that must never go direct is told about this server's networks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NetworkSeal {
    /// No network is offered, so there is nothing to stay behind.
    None,
    /// A network is up.
    Up,
    /// A network is expected and none is up: nothing may leave.
    Down,
}

