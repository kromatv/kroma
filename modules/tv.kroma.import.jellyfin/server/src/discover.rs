//! Finding servers on the local network: the dialect's question broadcast on the
//! discovery port, and each answer that names a server. See "Discovery" in
//! `docs/reference/jellyfin-api.md` and `docs/reference/emby-api.md`.

use std::net::{Ipv4Addr, SocketAddr};

use anyhow::Result;
use kroma_lan_probe::{waited, Lan};
use serde::Deserialize;

use crate::dialect::Dialect;
use crate::wire::{DiscoverAsk, Discovered, Server};

pub(crate) const DISCOVERY_PORT: u16 = 7359;
const LONGEST_ID: usize = 512;

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Answer {
    address: Option<String>,
    id: Option<String>,
    name: Option<String>,
}

fn scheme_and_port(address: &str) -> Option<(&'static str, u16)> {
    let (scheme, rest, port) = match address.split_once("://")? {
        ("http", rest) => ("http", rest, 8096),
        ("https", rest) => ("https", rest, 8920),
        _ => return None,
    };
    let authority = rest.split('/').next().unwrap_or_default();
    let tail = match authority.strip_prefix('[') {
        Some(bracketed) => bracketed.split_once(']').map(|(_, after)| after),
        None => Some(authority),
    };
    let named = tail
        .and_then(|tail| tail.rsplit_once(':'))
        .and_then(|(_, port)| port.parse().ok());
    Some((scheme, named.unwrap_or(port)))
}

fn server_of(from: SocketAddr, datagram: &[u8]) -> Option<Server> {
    if from.port() != DISCOVERY_PORT {
        return None;
    }
    let answer: Answer = serde_json::from_slice(datagram).ok()?;
    let id = answer.id.filter(|id| !id.is_empty() && id.len() <= LONGEST_ID)?;
    let (scheme, port) = scheme_and_port(answer.address.as_deref()?)?;
    let at = SocketAddr::new(from.ip(), port);
    Some(Server {
        id,
        name: answer.name.filter(|name| !name.trim().is_empty()).unwrap_or_else(|| at.to_string()),
        address: format!("{scheme}://{at}"),
    })
}

pub(crate) fn discover(lan: &dyn Lan, dialect: &Dialect, ask: &DiscoverAsk) -> Result<Discovered> {
    let to = SocketAddr::from((Ipv4Addr::BROADCAST, DISCOVERY_PORT));
    let heard = lan.ask(to, dialect.discovery.as_bytes(), waited(ask.wait_ms))?;
    let mut servers: Vec<Server> = Vec::new();
    for server in heard.iter().filter_map(|(from, datagram)| server_of(*from, datagram)) {
        if !servers.iter().any(|kept| kept.id == server.id) {
            servers.push(server);
        }
    }
    Ok(Discovered { servers })
}

#[cfg(test)]
mod tests;
