//! The one way out. Every connection a caller opens through the gateway names
//! who is calling and why, is decided by a [`Policy`], is dialled directly or
//! through an upstream SOCKS5 proxy (a VPN bridge), and is reported once it
//! closes. The gateway knows hosts, ports and callers, never what a module is
//! for.

mod gateway;
mod protocol;
mod upstream;

use std::net::IpAddr;
use std::time::Duration;

pub use gateway::{serve_tcp, serve_unix};

/// Where a caller asked to go, as it named it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Host {
    Name(String),
    Ip(IpAddr),
}

impl std::fmt::Display for Host {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Host::Name(name) => f.write_str(name),
            Host::Ip(ip) => write!(f, "{ip}"),
        }
    }
}

/// One connection a caller asked for.
#[derive(Debug, Clone)]
pub struct Request {
    pub caller: String,
    pub purpose: String,
    pub host: Host,
    pub port: u16,
}

/// What the policy decided for a [`Request`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Verdict {
    /// Dial it from this machine. Unless `private_allowed`, every address the
    /// name resolves to must be on the public internet, checked after
    /// resolution so a name cannot rebind to the LAN.
    Direct {
        private_allowed: bool,
    },
    Upstream(Upstream),
    Block(String),
}

/// A SOCKS5 proxy to chain through, which then resolves the name itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Upstream {
    pub address: String,
    pub credentials: Option<(String, String)>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Route {
    Direct,
    Upstream,
    Blocked,
}

/// One connection once it closed: what was asked, how it went, what crossed.
#[derive(Debug, Clone)]
pub struct Flow {
    pub caller: String,
    pub purpose: String,
    pub host: String,
    pub port: u16,
    pub route: Route,
    pub bytes_up: u64,
    pub bytes_down: u64,
    pub duration: Duration,
    pub error: Option<String>,
}

/// The gateway's questions. The credential is the SOCKS5 password a caller
/// presents; the purpose travels as its username.
pub trait Policy: Send + Sync + 'static {
    /// The caller a credential was issued to, or `None` to refuse it.
    fn caller_of(&self, credential: &str) -> Option<String>;

    /// Where `request` may go. Called on a blocking thread.
    fn decide(&self, request: &Request) -> Verdict;

    /// Called once per connection, refused ones included.
    fn record(&self, flow: Flow);
}
