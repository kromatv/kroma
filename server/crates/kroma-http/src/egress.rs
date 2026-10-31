//! The two process-wide hooks every [`crate::Fetch`] call passes through: a gate
//! that decides where the call goes before curl runs, and a sink that hears how
//! it went afterwards. With neither installed a call goes where its builder says.

use std::sync::{Arc, OnceLock};

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
}

pub type Gate = Arc<dyn Fn(&Outgoing) -> Ruling + Send + Sync>;
pub type Sink = Arc<dyn Fn(Exchange) + Send + Sync>;

pub const BLOCKED: &str = "blocked by the network policy";

const MAX_ERROR_CHARS: usize = 300;

static GATE: OnceLock<Gate> = OnceLock::new();
static SINK: OnceLock<Sink> = OnceLock::new();

/// Install the process's gate. Once per process: a second call fails and the
/// first gate stays.
pub fn set_gate(gate: Gate) -> Result<()> {
    if GATE.set(gate).is_err() {
        bail!("an egress gate is already installed");
    }
    Ok(())
}

/// Install the process's sink. Once per process, like [`set_gate`]. The sink
/// runs on the caller's thread after every call, so it must not block.
pub fn set_sink(sink: Sink) -> Result<()> {
    if SINK.set(sink).is_err() {
        bail!("an egress sink is already installed");
    }
    Ok(())
}

/// The installed gate's answer for `outgoing`, or [`Decision::Direct`] with no
/// gate. For a client that is not [`crate::Fetch`] and asks the same gate.
pub fn decide(outgoing: &Outgoing) -> Ruling {
    match GATE.get() {
        Some(gate) => gate(outgoing),
        None => Decision::Direct.into(),
    }
}

/// The installed gate's ruling on a `method` call to `url`, as [`crate::Fetch`]
/// asks it, with the target it read. While a gate is installed, a URL it
/// cannot read (userinfo, another scheme) is refused rather than let past it.
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
        None if GATE.get().is_some() => {
            Decision::Block("not a plain http or https URL".to_string()).into()
        }
        None => Decision::Direct.into(),
    };
    (target, ruling)
}

/// Hand `exchange` to the installed sink, if any. For a client that is not
/// [`crate::Fetch`] and reports to the same sink.
pub fn record(exchange: Exchange) {
    if let Some(sink) = SINK.get() {
        sink(exchange);
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
