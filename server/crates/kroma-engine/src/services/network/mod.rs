//! The network policy every outbound call is ruled by, and the journal of
//! where those calls went.
//!
//! The core's own calls are ruled in-process through the gate and sink
//! [`Network::install`] puts on `kroma_http`; a module sidecar asks over the
//! host callback and reports its flows the same way.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use kroma_http::address::WebTarget;
use kroma_http::egress::{Decision, Outgoing, Ruling};
use serde::Serialize;

use crate::db::Pool;
use crate::point::Point;
use crate::services::settings::Settings;

mod decide;
mod flow;
mod host_policy;
mod journal;
mod rules;
mod summary;

pub use decide::{CORE, GUARD_LINK_LOCAL, GUARD_LOOPBACK, decide};
pub use flow::{Flow, FlowFilter, FlowReport, FlowRoute, Verdict};
pub use journal::{Journal, RECENT_CAPACITY};
pub use rules::{
    Action, DefaultAction, MAX_BODY_BYTES, NetworkRules, Rule, RulesError, SETTING_KEY,
};
pub use summary::{MAX_DAYS, Summary, SummaryRow, Totals};

/// The point a `vpn` rule takes its SOCKS5 URL from.
pub const VPN_POINT: &str = "tv.kroma.vpn/proxy";

/// What the core's own calls are for, listed so the rules page can offer a
/// purpose before the journal has seen it.
pub const CORE_PURPOSES: &[&str] = &[
    "ai", "artwork", "mail", "metadata", "push", "registry", "stats", "themes", "updates",
];

/// The refusal a `vpn` rule gives while no VPN answers: it never falls back to
/// direct.
pub const VPN_DOWN: &str = "the VPN this rule asks for is not running";

/// How often the daily tallies reach the database.
pub const FLUSH_EVERY: Duration = Duration::from_secs(30);

const PROXY_TTL: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct CallerPurpose {
    pub caller: String,
    pub purpose: String,
}

/// Why a rules write did not land.
#[derive(Debug)]
pub enum RulesWriteError {
    Invalid(RulesError),
    Storage(anyhow::Error),
}

pub struct Network {
    db: Pool,
    settings: Settings,
    vpn: Point,
    journal: Journal,
    proxy: Mutex<Option<(Instant, Option<String>)>>,
}

impl Network {
    /// `vpn` is the point a `vpn` rule resolves its proxy through, normally
    /// [`VPN_POINT`].
    pub fn new(db: Pool, settings: Settings, vpn: Point) -> Self {
        Self {
            db,
            settings,
            vpn,
            journal: Journal::default(),
            proxy: Mutex::new(None),
        }
    }

    /// Put this policy and journal on every `kroma_http::Fetch` call this
    /// process makes, as the caller [`CORE`]. Once per process.
    pub fn install(self: &Arc<Self>) -> anyhow::Result<()> {
        let gate = Arc::clone(self);
        kroma_http::egress::set_gate(Arc::new(move |outgoing: &Outgoing| {
            gate.rule_on(CORE, outgoing.purpose, &outgoing.target)
        }))?;
        let sink = Arc::clone(self);
        kroma_http::egress::set_sink(Arc::new(move |exchange| {
            sink.record(CORE, exchange.into());
        }))
    }

    pub fn rules(&self) -> NetworkRules {
        NetworkRules::from_setting(self.settings.get(SETTING_KEY))
    }

    pub fn set_rules(&self, rules: NetworkRules) -> Result<(), RulesWriteError> {
        let rules = rules.validated().map_err(RulesWriteError::Invalid)?;
        let value = serde_json::to_value(&rules).map_err(|e| RulesWriteError::Storage(e.into()))?;
        self.settings
            .set_internal(&self.db, SETTING_KEY, value)
            .map_err(RulesWriteError::Storage)
    }

    /// Where a call `caller` makes for `purpose` to `target` goes. A `vpn`
    /// action becomes the VPN's proxy, or a refusal while no VPN answers.
    pub fn rule_on(&self, caller: &str, purpose: &str, target: &WebTarget) -> Ruling {
        let (action, rule) = decide(&self.rules(), caller, purpose, target);
        let decision = match action {
            Action::Direct => Decision::Direct,
            Action::Block => Decision::Block(refusal(rule.as_deref())),
            Action::Vpn => self
                .vpn_proxy()
                .map_or_else(|| Decision::Block(VPN_DOWN.to_string()), Decision::Proxy),
        };
        Ruling { decision, rule }
    }

    pub fn record(&self, caller: &str, report: FlowReport) {
        self.journal
            .record(caller, report, kroma_primitives::now_ms());
    }

    pub fn flows(&self, filter: &FlowFilter) -> Vec<Flow> {
        self.journal.recent(filter)
    }

    /// The last `days` days of tallies, flushing what is pending first so the
    /// summary agrees with the journal.
    pub fn summary(&self, days: u32) -> anyhow::Result<Summary> {
        self.flush()?;
        summary::summarize(&self.db, days, kroma_primitives::now_ms())
    }

    /// Every `(caller, purpose)` pair the journal has seen or the core makes,
    /// sorted and once each.
    pub fn purposes(&self) -> anyhow::Result<Vec<CallerPurpose>> {
        let mut pairs = crate::db::network_flows::purposes(&self.db)?;
        pairs.extend(self.journal.recent_purposes());
        pairs.extend(
            CORE_PURPOSES
                .iter()
                .map(|purpose| (CORE.to_string(), (*purpose).to_string())),
        );
        let mut purposes: Vec<CallerPurpose> = pairs
            .into_iter()
            .map(|(caller, purpose)| CallerPurpose { caller, purpose })
            .collect();
        purposes.sort();
        purposes.dedup();
        Ok(purposes)
    }

    pub fn flush(&self) -> anyhow::Result<()> {
        self.journal.flush(&self.db)
    }

    /// Write the pending tallies every [`FLUSH_EVERY`] for the life of the
    /// process.
    pub fn spawn_flusher(self: Arc<Self>) {
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(FLUSH_EVERY);
            loop {
                tick.tick().await;
                let network = Arc::clone(&self);
                if let Ok(Err(e)) = tokio::task::spawn_blocking(move || network.flush()).await {
                    tracing::warn!("the network tallies could not be written: {e:#}");
                }
            }
        });
    }

    fn vpn_proxy(&self) -> Option<String> {
        let cached = self.proxy.lock().unwrap_or_else(|e| e.into_inner()).clone();
        if let Some((at, url)) = cached.as_ref() {
            if at.elapsed() < PROXY_TTL {
                return url.clone();
            }
        }
        let url = self
            .vpn
            .call::<_, Option<String>>("url", &serde_json::json!({}))
            .flatten()
            .filter(|url| !url.trim().is_empty());
        *self.proxy.lock().unwrap_or_else(|e| e.into_inner()) = Some((Instant::now(), url.clone()));
        url
    }
}

fn refusal(rule: Option<&str>) -> String {
    match rule {
        Some(GUARD_LINK_LOCAL) => "a link-local address is never reachable".to_string(),
        Some(GUARD_LOOPBACK) => "a module may not reach this machine's loopback".to_string(),
        Some(id) => format!("rule {id}"),
        None => "the default action is block".to_string(),
    }
}

#[cfg(test)]
mod tests;
