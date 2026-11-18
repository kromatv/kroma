use std::net::{IpAddr, Ipv4Addr};

use anyhow::{anyhow, Result};

use crate::account::Connection;
use crate::failure::Failure;
use crate::plex::Plex;
use crate::server::{identity, Server, SERVER};
use crate::store::{self, ServerKey, ServerRow, SignIn};

const MAX_CANDIDATES: usize = 8;
const MAX_URI_BYTES: usize = 512;
const PLEX_DIRECT: &str = ".plex.direct";

impl Plex {
    /// The server a key names, at the address kept for it. With none kept, it
    /// asks plex.tv where the server is and keeps the first address that
    /// answers as that server.
    pub(crate) fn reach(&self, key: ServerKey<'_>) -> Result<Server<'_>> {
        let sign_in = self.signed_in(key.sign_in)?;
        let row = store::server(&self.store, key)?
            .ok_or_else(|| anyhow!("this sign-in reaches no such server"))?;
        let base = match &row.route {
            Some(route) => route.clone(),
            None => self.find(&sign_in, &row)?,
        };
        Ok(Server {
            web: &*self.web,
            base,
            token: row.token,
        })
    }

    fn find(&self, sign_in: &SignIn, row: &ServerRow) -> Result<String> {
        let client = store::client_id(&self.store)?;
        let listed = self.account(&client).servers(&sign_in.token)?;
        let resource = listed
            .into_iter()
            .find(|resource| resource.id == row.id)
            .ok_or_else(|| anyhow!("plex.tv no longer lists this server for the account"))?;
        let route = candidates(&resource.connections)
            .into_iter()
            .find(|base| identity(&*self.web, base).as_deref() == Some(row.id.as_str()))
            .ok_or(Failure::Unreached(SERVER))?;
        let key = ServerKey {
            sign_in: &sign_in.id,
            server: &row.id,
        };
        store::set_route(&self.store, key, Some(&route))?;
        Ok(route)
    }
}

/// The addresses to try for a server, best first: a local connection as
/// plex.tv lists it, the same one in plain HTTP, a remote one, then a relay.
/// Outside the local network only a `*.plex.direct` name over HTTPS is kept,
/// which is what `module.json` declares, and what keeps a token off plain HTTP
/// on the internet.
pub(crate) fn candidates(connections: &[Connection]) -> Vec<String> {
    let mut ranked: Vec<(u8, String)> = Vec::new();
    for connection in connections {
        let Some(uri) = clean(&connection.uri) else {
            continue;
        };
        let direct = uri.starts_with("https://") && host_of(&uri).is_some_and(is_plex_direct);
        match (connection.local, connection.relay, direct) {
            (true, false, _) => ranked.extend(local(connection, uri)),
            (false, false, true) => ranked.push((2, uri)),
            (_, true, true) => ranked.push((3, uri)),
            _ => {}
        }
    }
    ranked.sort_by_key(|(rank, _)| *rank);
    let mut bases: Vec<String> = Vec::new();
    for (_, base) in ranked {
        if !bases.contains(&base) {
            bases.push(base);
        }
    }
    bases.truncate(MAX_CANDIDATES);
    bases
}

fn local(connection: &Connection, uri: String) -> Vec<(u8, String)> {
    let named = host_of(&uri).is_some_and(|host| is_plex_direct(host) || is_address(host));
    let plain = connection
        .address
        .as_deref()
        .and_then(|address| address.parse::<Ipv4Addr>().ok())
        .zip(connection.port)
        .map(|(address, port)| (1, format!("http://{address}:{port}")));
    named.then_some((0, uri)).into_iter().chain(plain).collect()
}

fn clean(uri: &str) -> Option<String> {
    let scheme = uri.starts_with("https://") || uri.starts_with("http://");
    let plain = uri
        .chars()
        .all(|c| !c.is_whitespace() && !c.is_control() && c != '@');
    (scheme && plain && uri.len() <= MAX_URI_BYTES).then(|| uri.trim_end_matches('/').to_string())
}

fn host_of(uri: &str) -> Option<&str> {
    let (_, rest) = uri.split_once("://")?;
    let authority = rest.split(['/', '?', '#']).next()?;
    match authority.strip_prefix('[') {
        Some(bracketed) => bracketed.split(']').next(),
        None => authority.split(':').next(),
    }
}

fn is_plex_direct(host: &str) -> bool {
    host.len() > PLEX_DIRECT.len() && host.to_ascii_lowercase().ends_with(PLEX_DIRECT)
}

fn is_address(host: &str) -> bool {
    host.parse::<IpAddr>().is_ok()
}

#[cfg(test)]
mod tests;
