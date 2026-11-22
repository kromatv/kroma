//! A module's raw sockets: the `net.connect` entry that declares the transport
//! and covers the address, then the guards and the operator's rules, which must
//! let it go direct, since a raw socket goes through no network.

use std::net::SocketAddr;

use kroma_egress::lan::{is_cloud_metadata, place_of, reaches_this_machine, spreads, Place};
use kroma_http::address::WebTarget;
use kroma_http::egress::Decision;
use kroma_module_manifest::{host_matches, Connect, Permissions, Proto};

pub use kroma_egress::lan::{LocalNetwork, LocalNetworks};

use super::permissions::hosts_named;
use super::{Network, GUARD_LOOPBACK, PERMISSION_NET_CONNECT};

/// The guard that refuses the cloud metadata addresses that are not link-local.
pub const GUARD_METADATA: &str = "guard:metadata";

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

fn refusal(rule: Option<&str>, reason: String) -> SocketRefusal {
    SocketRefusal {
        rule: rule.map(str::to_string),
        reason,
    }
}

struct Seen<'a> {
    place: Place,
    spreads: bool,
    loopback: bool,
    literal: String,
    names: Vec<&'a str>,
    named: &'a dyn Fn(&str) -> Vec<String>,
}

impl<'a> Seen<'a> {
    fn of(socket: &RawSocket<'a>, networks: &[LocalNetwork], named: &'a dyn Fn(&str) -> Vec<String>) -> Self {
        let ip = socket.address.ip().to_canonical();
        let mut names: Vec<&str> = Vec::new();
        for name in socket.names {
            if !names.iter().any(|kept| kept.eq_ignore_ascii_case(name)) {
                names.push(name);
            }
        }
        Self {
            place: place_of(ip, networks),
            spreads: spreads(ip, networks),
            loopback: ip.is_loopback(),
            literal: ip.to_string(),
            names,
            named,
        }
    }

    fn hosts(&self) -> impl Iterator<Item = &str> {
        std::iter::once(self.literal.as_str()).chain(self.names.iter().copied())
    }

    fn reaches(&self, to: &str) -> bool {
        match to {
            "public" => self.place == Place::Public && !self.spreads,
            "lan" => self.place == Place::Lan,
            _ if self.spreads => false,
            _ => match to.strip_prefix("setting:") {
                Some(key) => self.setting_reaches(key),
                None => self.pattern_reaches(to),
            },
        }
    }

    fn pattern_reaches(&self, pattern: &str) -> bool {
        if pattern.eq_ignore_ascii_case(&self.literal) {
            return true;
        }
        let public = self.place == Place::Public;
        !self.loopback
            && self.names.iter().any(|name| {
                host_matches(pattern, name) && (public || web_target(name, 0).is_local())
            })
    }

    fn setting_reaches(&self, key: &str) -> bool {
        (self.named)(key).iter().any(|host| {
            let loopback_ok = !self.loopback || host.eq_ignore_ascii_case("localhost");
            host.eq_ignore_ascii_case(&self.literal)
                || (loopback_ok && self.names.iter().any(|name| name.eq_ignore_ascii_case(host)))
        })
    }
}

fn covering<'e>(declared: &'e Permissions, socket: &RawSocket<'_>, seen: &Seen<'_>) -> Vec<&'e Connect> {
    let port = socket.address.port();
    let covers = |entry: &&Connect| {
        entry.proto.contains(&socket.proto)
            && (entry.ports.is_empty() || entry.ports.contains(&port))
            && entry.to.iter().any(|to| seen.reaches(to))
    };
    declared.net.connect.iter().filter(covers).collect()
}

fn not_declared(socket: &RawSocket<'_>) -> SocketRefusal {
    refusal(
        Some(PERMISSION_NET_CONNECT),
        format!(
            "net.connect: {} over {} is not declared",
            socket.address,
            format!("{:?}", socket.proto).to_ascii_lowercase()
        ),
    )
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
        let seen = Seen::of(socket, &networks, &named);
        let entries = covering(&declared, socket, &seen);
        let first = entries.first().ok_or_else(|| not_declared(socket))?;
        self.guard(socket, &networks)?;
        let port = socket.address.port();
        for entry in &entries {
            for host in seen.hosts() {
                self.direct(caller, &entry.purpose, &web_target(host, port))?;
            }
        }
        Ok(first.purpose.clone())
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

    fn guard(&self, socket: &RawSocket<'_>, networks: &[LocalNetwork]) -> Result<(), SocketRefusal> {
        let ip = socket.address.ip();
        if is_cloud_metadata(ip) {
            return Err(refusal(
                Some(GUARD_METADATA),
                "a cloud metadata service is never reachable".to_string(),
            ));
        }
        if reaches_this_machine(ip, networks) && self.own_ports().contains(&socket.address.port()) {
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
