//! A module's raw sockets: the `net.connect` entry that declares the transport
//! and covers the address, then the guards and the operator's rules, which must
//! let it go direct, since a raw socket goes through no network.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;

use if_addrs::IfAddr;
use kroma_http::address::{is_public, WebTarget};
use kroma_http::egress::Decision;
use kroma_module_manifest::{host_matches, Connect, Permissions, Proto};

use super::decide::prefix_matches;
use super::permissions::hosts_named;
use super::{Network, GUARD_LOOPBACK, PERMISSION_NET_CONNECT};

/// One network an interface of this machine sits on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LocalNetwork {
    pub address: IpAddr,
    pub prefix: u8,
}

/// The networks this machine's interfaces sit on, loopback left out.
pub type LocalNetworks = Arc<dyn Fn() -> Vec<LocalNetwork> + Send + Sync>;

/// One use of a raw socket a module's component makes: the transport, the
/// remote address, and every name the module resolved to that address.
#[derive(Debug, Clone, Copy)]
pub struct RawSocket<'a> {
    pub proto: Proto,
    pub address: SocketAddr,
    pub names: &'a [String],
}

/// Why a raw socket or a lookup is refused, and the rule or guard that refused it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SocketRefusal {
    pub rule: Option<String>,
    pub reason: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Place {
    Public,
    Lan,
    Elsewhere,
}

pub(super) fn interface_networks() -> Vec<LocalNetwork> {
    if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|interface| !interface.is_loopback())
        .map(|interface| LocalNetwork {
            address: interface.ip(),
            prefix: match interface.addr {
                IfAddr::V4(v4) => v4.prefixlen,
                IfAddr::V6(v6) => v6.prefixlen,
            },
        })
        .collect()
}

impl LocalNetwork {
    fn contains(&self, ip: IpAddr) -> bool {
        let bits = u32::from(self.prefix);
        match (self.address, ip) {
            (IpAddr::V4(network), IpAddr::V4(ip)) => {
                bits <= 32 && prefix_matches(u32::from(ip).into(), u32::from(network).into(), 32, bits)
            }
            (IpAddr::V6(network), IpAddr::V6(ip)) => {
                bits <= 128 && prefix_matches(ip.into(), network.into(), 128, bits)
            }
            _ => false,
        }
    }

    fn broadcast(&self) -> Option<IpAddr> {
        let IpAddr::V4(address) = self.address else {
            return None;
        };
        let host_bits = u32::MAX.checked_shr(u32::from(self.prefix)).filter(|bits| *bits > 0)?;
        Some(Ipv4Addr::from(u32::from(address) | host_bits).into())
    }
}

fn spreads(ip: IpAddr, networks: &[LocalNetwork]) -> bool {
    ip.is_multicast()
        || ip == IpAddr::V4(Ipv4Addr::BROADCAST)
        || networks.iter().any(|network| network.broadcast() == Some(ip))
}

fn stays_on_the_link(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, c, _] = v4.octets();
            v4 == Ipv4Addr::BROADCAST || (a == 224 && b == 0 && c == 0) || a == 239
        }
        IpAddr::V6(v6) => v6.segments()[0] == 0xff02,
    }
}

fn place_of(ip: IpAddr, networks: &[LocalNetwork]) -> Place {
    if is_public(ip) {
        return Place::Public;
    }
    if stays_on_the_link(ip) || networks.iter().any(|network| network.contains(ip)) {
        return Place::Lan;
    }
    Place::Elsewhere
}

fn hosts_of(socket: &RawSocket<'_>) -> Vec<String> {
    let mut hosts = vec![socket.address.ip().to_canonical().to_string()];
    hosts.extend(socket.names.iter().cloned());
    hosts
}

fn refusal(rule: Option<&str>, reason: String) -> SocketRefusal {
    SocketRefusal {
        rule: rule.map(str::to_string),
        reason,
    }
}

struct Seen<'a> {
    place: Place,
    spreads: bool,
    hosts: Vec<String>,
    named: &'a dyn Fn(&str) -> Vec<String>,
}

impl Seen<'_> {
    fn reaches(&self, to: &str) -> bool {
        match to {
            "public" => self.place == Place::Public,
            "lan" => self.place == Place::Lan,
            _ if self.spreads => false,
            _ => match to.strip_prefix("setting:") {
                Some(key) => (self.named)(key)
                    .iter()
                    .any(|named| self.hosts.iter().any(|host| host.eq_ignore_ascii_case(named))),
                None => self.hosts.iter().any(|host| host_matches(to, host)),
            },
        }
    }
}

fn covering<'a>(declared: &'a Permissions, socket: &RawSocket<'_>, seen: &Seen<'_>) -> Option<&'a Connect> {
    let port = socket.address.port();
    declared.net.connect.iter().find(|entry| {
        entry.proto.contains(&socket.proto)
            && (entry.ports.is_empty() || entry.ports.contains(&port))
            && entry.to.iter().any(|to| seen.reaches(to))
    })
}

fn web_target(host: &str, port: u16) -> WebTarget {
    WebTarget {
        https: false,
        host: host.to_string(),
        port,
    }
}

fn lookup_reaches(to: &str, name: &str, named: &dyn Fn(&str) -> Vec<String>) -> bool {
    let local = web_target(name, 0).is_local();
    match to {
        "public" => !local,
        "lan" => false,
        _ => match to.strip_prefix("setting:") {
            Some(key) => named(key).iter().any(|host| host.eq_ignore_ascii_case(name)),
            None => host_matches(to, name),
        },
    }
}

impl Network {
    /// The networks a raw socket counts as `lan`, normally those of this
    /// machine's interfaces.
    pub fn with_local_networks(self, networks: LocalNetworks) -> Self {
        Self {
            local_networks: networks,
            ..self
        }
    }

    fn declared_for(&self, caller: &str) -> Result<Permissions, SocketRefusal> {
        (self.declared)(caller).ok_or_else(|| {
            refusal(
                Some(PERMISSION_NET_CONNECT),
                "a module that declares no permissions has no raw socket".to_string(),
            )
        })
    }

    /// The purpose a raw socket `caller`'s component uses is ruled under, or why
    /// it is refused. The first `net.connect` entry that names the transport in
    /// its `proto` and covers the address and port decides the purpose; then the
    /// guards and the operator's rules must send it direct, for the address and
    /// for each name resolved to it.
    pub fn rule_socket(&self, caller: &str, socket: &RawSocket<'_>) -> Result<String, SocketRefusal> {
        let declared = self.declared_for(caller)?;
        let networks = (self.local_networks)();
        let named = |key: &str| hosts_named(&self.settings.get(key));
        let ip = socket.address.ip().to_canonical();
        let seen = Seen {
            place: place_of(ip, &networks),
            spreads: spreads(ip, &networks),
            hosts: hosts_of(socket),
            named: &named,
        };
        let entry = covering(&declared, socket, &seen).ok_or_else(|| {
            refusal(
                Some(PERMISSION_NET_CONNECT),
                format!(
                    "net.connect: {} over {} is not declared",
                    socket.address,
                    format!("{:?}", socket.proto).to_ascii_lowercase()
                ),
            )
        })?;
        self.guard_own(socket, &networks)?;
        for host in &seen.hosts {
            self.direct(caller, &entry.purpose, &web_target(host, socket.address.port()))?;
        }
        Ok(entry.purpose.clone())
    }

    /// The purpose a lookup of `name` for a raw socket is ruled under, or why it
    /// is refused. A name is looked up only for an entry with a `proto` that
    /// names it, by a host pattern or a setting, or that reaches `public` and the
    /// name is not a local one; `lan` grants no lookup.
    pub fn rule_lookup(&self, caller: &str, name: &str) -> Result<String, SocketRefusal> {
        let declared = self.declared_for(caller)?;
        let named = |key: &str| hosts_named(&self.settings.get(key));
        let entry = declared
            .net
            .connect
            .iter()
            .find(|entry| !entry.proto.is_empty() && entry.to.iter().any(|to| lookup_reaches(to, name, &named)))
            .ok_or_else(|| {
                refusal(
                    Some(PERMISSION_NET_CONNECT),
                    format!("net.connect: no raw socket is declared for {name}"),
                )
            })?;
        self.direct(caller, &entry.purpose, &web_target(name, 0))?;
        Ok(entry.purpose.clone())
    }

    fn guard_own(&self, socket: &RawSocket<'_>, networks: &[LocalNetwork]) -> Result<(), SocketRefusal> {
        let ip = socket.address.ip().to_canonical();
        let own = ip.is_loopback() || ip.is_unspecified() || networks.iter().any(|network| network.address == ip);
        if own && self.own_ports().contains(&socket.address.port()) {
            return Err(refusal(
                Some(GUARD_LOOPBACK),
                "a module may not reach this server's own listeners".to_string(),
            ));
        }
        Ok(())
    }

    fn direct(&self, caller: &str, purpose: &str, target: &WebTarget) -> Result<(), SocketRefusal> {
        let ruling = self.rule_on(caller, purpose, target);
        match ruling.decision {
            Decision::Direct => Ok(()),
            Decision::Block(reason) => Err(refusal(ruling.rule.as_deref(), reason)),
            Decision::Proxy(_) => Err(refusal(
                ruling.rule.as_deref(),
                "a raw socket cannot go through a network".to_string(),
            )),
        }
    }
}
