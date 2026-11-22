//! Finding Plex Media Servers on the local network with GDM: one search sent to
//! GDM's multicast group, and each answer a server sends back. See "Discovery"
//! in `docs/reference/plex-api.md`.

use std::net::{Ipv4Addr, SocketAddr};

use anyhow::Result;
use kroma_lan_probe::{waited, Lan};

use crate::wire::{DiscoverAsk, Discovered, ServerRef};

pub(crate) const GDM_PORT: u16 = 32414;
const GDM_GROUP: Ipv4Addr = Ipv4Addr::new(239, 0, 0, 250);
const SEARCH: &[u8] = b"M-SEARCH * HTTP/1.0";
const MEDIA_SERVER: &str = "plex/media-server";
const LONGEST_ID: usize = 512;

fn headers(text: &str) -> Option<Vec<(String, &str)>> {
    let mut lines = text.lines();
    if !lines.next()?.contains("200 OK") {
        return None;
    }
    let named = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(name, value)| (name.trim().to_ascii_lowercase(), value.trim()));
    Some(named.collect())
}

fn header<'a>(headers: &[(String, &'a str)], name: &str) -> Option<&'a str> {
    headers.iter().find(|(key, _)| key == name).map(|(_, value)| *value)
}

fn identity<'a>(headers: &[(String, &'a str)]) -> Option<(&'a str, u16)> {
    if header(headers, "content-type")? != MEDIA_SERVER {
        return None;
    }
    let id = header(headers, "resource-identifier").filter(|id| !id.is_empty() && id.len() <= LONGEST_ID)?;
    Some((id, header(headers, "port")?.parse().ok()?))
}

fn server_of(from: SocketAddr, datagram: &[u8]) -> Option<ServerRef> {
    if from.port() != GDM_PORT {
        return None;
    }
    let headers = headers(std::str::from_utf8(datagram).ok()?)?;
    let (id, port) = identity(&headers)?;
    let at = SocketAddr::new(from.ip(), port);
    let name = header(&headers, "name").filter(|name| !name.is_empty());
    Some(ServerRef {
        id: id.to_string(),
        name: name.map_or_else(|| at.to_string(), str::to_string),
        address: Some(format!("http://{at}")),
    })
}

pub(crate) fn discover(lan: &dyn Lan, ask: &DiscoverAsk) -> Result<Discovered> {
    let to = SocketAddr::from((GDM_GROUP, GDM_PORT));
    let heard = lan.ask(to, SEARCH, waited(ask.wait_ms))?;
    let mut servers: Vec<ServerRef> = Vec::new();
    for found in heard.iter().filter_map(|(from, datagram)| server_of(*from, datagram)) {
        if servers.iter().all(|kept| kept.id != found.id) {
            servers.push(found);
        }
    }
    Ok(Discovered { servers })
}

#[cfg(test)]
mod tests;
