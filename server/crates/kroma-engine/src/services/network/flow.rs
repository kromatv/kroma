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

/// Whether a rule or a filter naming `named` covers `purpose`: the purpose itself
/// or one of its dotted children, so `metadata` still reaches `metadata.search`.
pub fn purpose_covers(named: &str, purpose: &str) -> bool {
    purpose
        .strip_prefix(named)
        .is_some_and(|rest| rest.is_empty() || rest.starts_with('.'))
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

/// Which recent flows to list, newest first: at most `limit` after skipping
/// `offset`, and only those matching every filter set. `before` keeps out every
/// flow from that id on, so pages taken from it stay put while new flows arrive;
/// `host` is a lowercase needle in `host:port`.
#[derive(Debug, Clone, Default)]
pub struct FlowFilter {
    pub limit: usize,
    pub offset: usize,
    pub before: Option<u64>,
    pub caller: Option<String>,
    pub purpose: Option<String>,
    pub verdict: Option<Verdict>,
    pub host: Option<String>,
}

/// One page of the journal, and how many flows match across every page.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FlowPage {
    pub flows: Vec<Flow>,
    pub total: usize,
}

impl FlowFilter {
    pub(super) fn admits(&self, flow: &Flow) -> bool {
        self.caller.as_deref().is_none_or(|c| c == flow.caller)
            && self
                .purpose
                .as_deref()
                .is_none_or(|p| purpose_covers(p, &flow.purpose))
            && self.verdict.is_none_or(|v| v == flow.route.verdict())
            && self.before.is_none_or(|before| flow.id < before)
            && self.host.as_deref().is_none_or(|needle| {
                format!("{}:{}", flow.host, flow.port)
                    .to_lowercase()
                    .contains(needle)
            })
    }
}
