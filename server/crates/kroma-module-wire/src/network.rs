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
}
