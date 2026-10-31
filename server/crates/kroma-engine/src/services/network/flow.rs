//! One outbound flow: as a caller reports it, and as the journal serves it.

use kroma_http::egress::{Exchange, Route};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FlowRoute {
    Direct,
    Vpn,
    Blocked,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Verdict {
    Allowed,
    Blocked,
}

impl FlowRoute {
    pub fn as_str(self) -> &'static str {
        match self {
            FlowRoute::Direct => "direct",
            FlowRoute::Vpn => "vpn",
            FlowRoute::Blocked => "blocked",
        }
    }

    pub fn verdict(self) -> Verdict {
        match self {
            FlowRoute::Blocked => Verdict::Blocked,
            FlowRoute::Direct | FlowRoute::Vpn => Verdict::Allowed,
        }
    }
}

impl Verdict {
    pub fn as_str(self) -> &'static str {
        match self {
            Verdict::Allowed => "allowed",
            Verdict::Blocked => "blocked",
        }
    }
}

/// One finished call as its caller reported it. The journal clips long fields
/// when it files one, since a module's report is that module's say-so.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlowReport {
    pub purpose: String,
    pub method: String,
    pub host: String,
    pub port: u16,
    pub route: FlowRoute,
    pub status: Option<u16>,
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub duration_ms: u64,
    pub error: Option<String>,
    pub rule: Option<String>,
}

impl From<Exchange> for FlowReport {
    fn from(exchange: Exchange) -> Self {
        let route = match exchange.route {
            Route::Direct => FlowRoute::Direct,
            Route::Proxy => FlowRoute::Vpn,
            Route::Blocked => FlowRoute::Blocked,
        };
        Self {
            purpose: exchange.purpose.to_string(),
            method: exchange.method.to_string(),
            host: exchange.host,
            port: exchange.port,
            route,
            status: exchange.status,
            bytes_in: exchange.bytes_in,
            bytes_out: exchange.bytes_out,
            duration_ms: exchange.duration_ms,
            error: exchange.error,
            rule: exchange.rule,
        }
    }
}

/// One journal entry, as the admin API serves it. `at` is epoch milliseconds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Flow {
    pub id: u64,
    pub at: i64,
    pub caller: String,
    pub purpose: String,
    pub method: String,
    pub host: String,
    pub port: u16,
    pub route: FlowRoute,
    pub status: Option<u16>,
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub duration_ms: u64,
    pub error: Option<String>,
    pub rule: Option<String>,
}

/// Which recent flows to list, newest first: at most `limit`, and only those
/// matching every filter set.
#[derive(Debug, Clone, Default)]
pub struct FlowFilter {
    pub limit: usize,
    pub caller: Option<String>,
    pub purpose: Option<String>,
    pub verdict: Option<Verdict>,
}

impl FlowFilter {
    pub(super) fn admits(&self, flow: &Flow) -> bool {
        self.caller.as_deref().is_none_or(|c| c == flow.caller)
            && self.purpose.as_deref().is_none_or(|p| p == flow.purpose)
            && self.verdict.is_none_or(|v| v == flow.route.verdict())
    }
}
