use std::net::IpAddr;

use crate::account::is_plain;
use crate::xml::Element;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Connection {
    pub uri: String,
    pub protocol: Option<String>,
    pub address: Option<String>,
    pub port: Option<u16>,
    pub local: bool,
    pub relay: bool,
}

/// A server the account owns. `token` is the account's token for it, so this
/// has no `Debug`.
pub(crate) struct Resource {
    pub id: String,
    pub name: String,
    pub token: String,
    pub connections: Vec<Connection>,
}

impl Resource {
    /// Where the server is, in a form its owner recognises: the address of its
    /// first connection, a local one when it has one.
    pub(crate) fn address(&self) -> Option<String> {
        let direct = || self.connections.iter().filter(|c| !c.relay);
        let first = direct().find(|c| c.local).or_else(|| direct().next())?;
        let address: IpAddr = first.address.as_deref()?.parse().ok()?;
        let protocol = first.protocol.as_deref()?;
        let port = first.port?;
        let known = matches!(protocol, "http" | "https");
        known.then(|| match address {
            IpAddr::V4(v4) => format!("{protocol}://{v4}:{port}"),
            IpAddr::V6(v6) => format!("{protocol}://[{v6}]:{port}"),
        })
    }
}

pub(super) fn owned(listed: &Element) -> Vec<Resource> {
    listed
        .every("resource")
        .into_iter()
        .filter_map(owned_server)
        .collect()
}

fn owned_server(resource: &Element) -> Option<Resource> {
    let provides = resource.attr("provides").unwrap_or_default();
    let is_server = provides.split(',').any(|what| what.trim() == "server");
    if !is_server || !resource.flag("owned") {
        return None;
    }
    let id = resource
        .text("clientIdentifier")
        .filter(|id| is_plain(id))?;
    Some(Resource {
        name: resource.text("name").unwrap_or_else(|| id.clone()),
        token: resource.text("accessToken")?,
        connections: resource
            .every("connection")
            .into_iter()
            .filter_map(connection)
            .collect(),
        id,
    })
}

fn connection(listed: &Element) -> Option<Connection> {
    Some(Connection {
        uri: listed.text("uri")?,
        protocol: listed.text("protocol"),
        address: listed.text("address"),
        port: listed.number("port"),
        local: listed.flag("local"),
        relay: listed.flag("relay"),
    })
}

pub(super) fn token_for(listed: &Element, machine: &str) -> Option<String> {
    listed
        .every("resource")
        .into_iter()
        .find(|resource| resource.text("clientIdentifier").as_deref() == Some(machine))
        .and_then(|resource| resource.text("accessToken"))
}
