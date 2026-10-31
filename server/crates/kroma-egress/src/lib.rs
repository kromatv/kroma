//! The one way out: a SOCKS5 gateway that names the caller of every connection,
//! asks a [`Policy`] where it may go, and reports what crossed.

mod gateway;
mod protocol;
mod upstream;

use std::net::IpAddr;
use std::time::Duration;

pub use gateway::{serve_tcp, serve_unix};

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

#[derive(Debug, Clone)]
pub struct Request {
    pub caller: String,
    pub purpose: String,
    pub host: Host,
    pub port: u16,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Verdict {
    /// Unless `private_allowed`, every address the name resolves to must be
    /// public.
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
