//! The two process-wide hooks every [`crate::Fetch`] call passes through: a gate
//! that decides where the call goes before curl runs, and a sink that hears how
//! it went afterwards. With no gate a call goes where its builder says, unless
//! the process called [`require_gate`]. With no sink, the exchange waits for one.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock, PoisonError};
use std::time::SystemTime;

use anyhow::{bail, Result};

use crate::address::{web_target, WebTarget};

/// One call about to leave the process, as the gate sees it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outgoing {
    pub purpose: &'static str,
    pub method: &'static str,
    pub target: WebTarget,
}

/// Where the gate sends a call. [`Decision::Proxy`] carries a SOCKS5 URL and
/// replaces any proxy the caller set; [`Decision::Direct`] keeps one the caller
/// set itself; [`Decision::Block`] fails the call before curl runs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    Direct,
    Proxy(String),
    Block(String),
}

/// A [`Decision`] and the rule that made it, which the sink then records.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ruling {
    pub decision: Decision,
    pub rule: Option<String>,
}

impl From<Decision> for Ruling {
    fn from(decision: Decision) -> Self {
        Self {
            decision,
            rule: None,
        }
    }
}

/// How a finished call left the process.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Route {
    Direct,
    Proxy,
    Blocked,
}

/// One finished call. It names a host and a port and never a path, a query
/// string or userinfo, because that is where passkeys and API keys travel.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Exchange {
    pub purpose: &'static str,
    pub method: &'static str,
    pub host: String,
    pub port: u16,
    pub route: Route,
    pub status: Option<u16>,
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub duration_ms: u64,
    pub error: Option<String>,
    pub rule: Option<String>,
    /// The process's [`Gateway`] carried this call and files the connection
    /// itself, so this record only adds what the gateway cannot see.
    pub carried: bool,
}

impl Exchange {
    /// The record of a call to `host:port` by a client that is not
    /// [`crate::Fetch`] and cannot take a proxy, as `ruling` let it start, and
    /// the error the call fails with when it may not: a [`Decision::Block`]'s
    /// reason, or `no_proxy` for a [`Decision::Proxy`]. A refused call is
    /// recorded as [`Route::Blocked`].
    pub fn direct_only(
        purpose: &'static str,
        method: &'static str,
        host: String,
        port: u16,
        ruling: Ruling,
        no_proxy: &str,
    ) -> (Self, Option<String>) {
        let refusal = match ruling.decision {
            Decision::Direct => None,
            Decision::Block(reason) => Some(format!("{BLOCKED}: {reason}")),
            Decision::Proxy(_) => Some(format!("{BLOCKED}: {no_proxy}")),
        };
        let exchange = Self {
            purpose,
            method,
            host,
            port,
            route: if refusal.is_some() {
                Route::Blocked
            } else {
                Route::Direct
            },
            status: None,
            bytes_in: 0,
            bytes_out: 0,
            duration_ms: 0,
            error: None,
            rule: ruling.rule,
            carried: false,
        };
        (exchange, refusal)
    }
}

/// The core's gateway as this process reaches it: a SOCKS5 endpoint and the
/// credential that names this process as its caller.
#[derive(Clone, PartialEq, Eq)]
pub struct Gateway {
    pub address: String,
    pub credential: String,
}

impl std::fmt::Debug for Gateway {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Gateway")
            .field("address", &self.address)
            .finish_non_exhaustive()
    }
}

impl Gateway {
    /// The SOCKS5 username for a connection made for `purpose`: `.public` when
    /// every address must be public, and `.vpn` when it must take the VPN or fail.
    pub fn username(purpose: &str, public_only: bool, sealed: bool) -> String {
        let mut username = purpose.to_string();
        if public_only {
            username.push_str(".public");
        }
        if sealed {
            username.push_str(".vpn");
        }
        username
    }

    /// This gateway as a SOCKS5 URL, for a library that takes one and cannot go
    /// through [`crate::Fetch`].
    pub fn proxy_url(&self, purpose: &str, sealed: bool) -> String {
        format!(
            "socks5://{}:{}@{}",
            Self::username(purpose, false, sealed),
            self.credential,
            self.address
        )
    }
}

pub type Gate = Arc<dyn Fn(&Outgoing) -> Ruling + Send + Sync>;

/// Hears each finished exchange and the time it finished.
pub type Sink = Arc<dyn Fn(Exchange, SystemTime) + Send + Sync>;

pub const BLOCKED: &str = "blocked by the network policy";

pub const NO_GATE: &str = "it is not installed yet";

pub const MAX_PENDING: usize = 256;

const MAX_ERROR_CHARS: usize = 300;

static GATE: OnceLock<Gate> = OnceLock::new();
static SINK: OnceLock<Sink> = OnceLock::new();
static GATEWAY: OnceLock<Gateway> = OnceLock::new();
static GATE_REQUIRED: AtomicBool = AtomicBool::new(false);
static PENDING: Mutex<Vec<(Exchange, SystemTime)>> = Mutex::new(Vec::new());

/// Refuse every call made while no gate is installed, where it would otherwise
/// go direct. Never undone. The server binary calls it before anything can open
/// a connection; a process that never does keeps [`Decision::Direct`] for a
/// call made with no gate.
pub fn require_gate() {
    GATE_REQUIRED.store(true, Ordering::SeqCst);
}

/// Install the process's gate. Once per process: a second call fails and the
/// first gate stays.
pub fn set_gate(gate: Gate) -> Result<()> {
    if GATE.set(gate).is_err() {
        bail!("an egress gate is already installed");
    }
    Ok(())
}

/// Send every [`crate::Fetch`] this process makes through `gateway`. Once per
/// process, like [`set_gate`].
pub fn set_gateway(gateway: Gateway) -> Result<()> {
    if GATEWAY.set(gateway).is_err() {
        bail!("an egress gateway is already installed");
    }
    Ok(())
}

/// The gateway this process goes through, when it has one.
pub fn gateway() -> Option<&'static Gateway> {
    GATEWAY.get()
}

/// Install the process's sink, then hand it the exchanges recorded before it,
/// oldest first. Once per process, like [`set_gate`]. The sink runs on the
/// caller's thread after every call, so it must not block.
pub fn set_sink(sink: Sink) -> Result<()> {
    let mut pending = PENDING.lock().unwrap_or_else(PoisonError::into_inner);
    if SINK.set(Arc::clone(&sink)).is_err() {
        bail!("an egress sink is already installed");
    }
    let backlog = std::mem::take(&mut *pending);
    drop(pending);
    for (exchange, at) in backlog {
        sink(exchange, at);
    }
    Ok(())
}

/// The installed gate's answer for `outgoing`. With no gate, a refusal naming
/// [`NO_GATE`] once [`require_gate`] was called, and [`Decision::Direct`]
/// otherwise. For a client that is not [`crate::Fetch`] and asks the same gate.
pub fn decide(outgoing: &Outgoing) -> Ruling {
    match GATE.get() {
        Some(gate) => gate(outgoing),
        None if GATE_REQUIRED.load(Ordering::SeqCst) => Decision::Block(NO_GATE.to_string()).into(),
        None => Decision::Direct.into(),
    }
}

/// The installed gate's ruling on a `method` call to `url`, as [`crate::Fetch`]
/// asks it, with the target it read. While a gate is installed, a URL it
/// cannot read (userinfo, another scheme) is refused rather than let past it,
/// and so it is once [`require_gate`] was called.
pub fn rule_url(
    purpose: &'static str,
    method: &'static str,
    url: &str,
) -> (Option<WebTarget>, Ruling) {
    let target = web_target(url);
    let ruling = match &target {
        Some(target) => decide(&Outgoing {
            purpose,
            method,
            target: target.clone(),
        }),
        None if GATE.get().is_some() || GATE_REQUIRED.load(Ordering::SeqCst) => {
            Decision::Block("not a plain http or https URL".to_string()).into()
        }
        None => Decision::Direct.into(),
    };
    (target, ruling)
}

/// Hand `exchange` to the installed sink, stamped with the time now. Before a
/// sink is installed it is kept for the sink, up to [`MAX_PENDING`] exchanges;
/// later ones are dropped. For a client that is not [`crate::Fetch`] and
/// reports to the same sink.
pub fn record(exchange: Exchange) {
    let at = SystemTime::now();
    if let Some(sink) = SINK.get() {
        sink(exchange, at);
        return;
    }
    let mut pending = PENDING.lock().unwrap_or_else(PoisonError::into_inner);
    match SINK.get() {
        Some(sink) => {
            drop(pending);
            sink(exchange, at);
        }
        None => keep(&mut pending, exchange, at),
    }
}

fn keep(pending: &mut Vec<(Exchange, SystemTime)>, exchange: Exchange, at: SystemTime) {
    if pending.len() < MAX_PENDING {
        pending.push((exchange, at));
    }
}

/// `error` fit for an [`Exchange`]: `url` replaced by `host`, since our own
/// errors and some of curl's quote the URL whole, and cut to a bounded length.
pub fn scrubbed(error: &str, url: &str, host: &str) -> String {
    let scrubbed = if url.is_empty() {
        error.to_string()
    } else {
        error.replace(url, host)
    };
    scrubbed.chars().take(MAX_ERROR_CHARS).collect()
}

#[cfg(test)]
mod tests;
