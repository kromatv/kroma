//! The network policy every outbound call is ruled by, and the journal of
//! where those calls went. The core's own calls are ruled in-process through
//! [`Network::install`]; a module's are ruled when the module host asks on its
//! behalf.

use std::sync::{Arc, Mutex};
use std::time::Instant;

use kroma_http::address::WebTarget;
use kroma_http::egress::{Decision, Outgoing, Ruling};

use crate::db::Pool;
use crate::point::Point;
use crate::services::settings::Settings;

mod decide;
mod flow;
mod history;
mod host_policy;
mod inbound;
mod journal;
mod offers;
mod permissions;
mod rules;
mod summary;

pub use decide::{decide, CORE, GUARD_LINK_LOCAL, GUARD_LOOPBACK};
use decide::is_this_machine;
pub use flow::{Flow, FlowFilter, FlowPage, FlowReport, FlowRoute, Verdict};
pub use history::{CallerPurpose, CORE_PURPOSES, FLUSH_EVERY};
pub use inbound::{via_of, Arrival, InboundJournal, InboundSummary, Via};
pub use journal::{Journal, CARRIED_METHOD, RECENT_CAPACITY, TALLIED_PUBLIC_ADDRESS};
pub use offers::{NetworkProviders, NO_NETWORK};
pub use permissions::{DeclaredListeners, DeclaredPermissions, PERMISSION_NET_CONNECT};
pub use rules::{
    Action, DefaultAction, NetworkRules, Rule, RulesError, MAX_BODY_BYTES, SETTING_KEY,
};
pub use summary::{Summary, SummaryRow, Totals, MAX_DAYS};

use offers::Offers;

pub const NETWORK_POINT: &str = "network";

#[derive(Debug)]
pub enum RulesWriteError {
    Invalid(RulesError),
    Storage(anyhow::Error),
}

pub struct Network {
    db: Pool,
    settings: Settings,
    networks: Point,
    providers: NetworkProviders,
    listeners: DeclaredListeners,
    journal: Journal,
    inbound: InboundJournal,
    offers: Mutex<Option<(Instant, Offers)>>,
    core_port: Option<u16>,
    https_port: Option<u16>,
    declared: DeclaredPermissions,
}

impl Network {
    /// `networks` is the point every network is offered on, normally
    /// [`NETWORK_POINT`].
    pub fn new(db: Pool, settings: Settings, networks: Point) -> Self {
        Self {
            db,
            settings,
            networks,
            providers: Arc::new(Vec::new),
            listeners: Arc::new(Vec::new),
            journal: Journal::default(),
            inbound: InboundJournal::default(),
            offers: Mutex::new(None),
            core_port: None,
            https_port: None,
            declared: Arc::new(|_| None),
        }
    }

    /// The `permissions` block each module declares, which its calls must stay
    /// within. Without it every module counts as declaring none.
    pub fn with_declared(mut self, declared: DeclaredPermissions) -> Self {
        self.declared = declared;
        self
    }

    /// Who should be answering the `network` point. A call that must never go
    /// direct is refused while one of them is silent.
    pub fn with_providers(mut self, providers: NetworkProviders) -> Self {
        self.providers = providers;
        self
    }

    /// What the enabled modules declare they listen on, which the loopback
    /// guard keeps every other module away from.
    pub fn with_listeners(mut self, listeners: DeclaredListeners) -> Self {
        self.listeners = listeners;
        self
    }

    /// The core's own HTTP port, and its HTTPS port when the environment pins
    /// one (otherwise the `httpsPort` setting is read at each decision).
    pub fn with_core_ports(mut self, http: u16, https: Option<u16>) -> Self {
        self.core_port = Some(http);
        self.https_port = https;
        self
    }

    fn own_ports(&self) -> Vec<u16> {
        let setting =
            |key: &str, fallback: i64| u16::try_from(self.settings.get_i64(key, fallback)).ok();
        let set_port = |key: &str| setting(key, 0).filter(|port| *port > 0);
        let mut ports: Vec<u16> = [
            self.core_port,
            self.https_port.or_else(|| setting("httpsPort", 4443)),
        ]
        .into_iter()
        .flatten()
        .collect();
        for listen in (self.listeners)() {
            ports.extend(listen.ports(&set_port));
        }
        ports
    }

    /// Put this policy and journal on every `kroma_http::Fetch` call this
    /// process makes, as the caller [`CORE`]. Once per process. The calls made
    /// before it are journaled at the time they finished.
    pub fn install(self: &Arc<Self>) -> anyhow::Result<()> {
        let gate = Arc::clone(self);
        kroma_http::egress::set_gate(Arc::new(move |outgoing: &Outgoing| {
            gate.rule_on(CORE, outgoing.purpose, &outgoing.target)
        }))?;
        let sink = Arc::clone(self);
        kroma_http::egress::set_sink(Arc::new(move |exchange, at| {
            sink.journal
                .record(CORE, exchange.into(), kroma_primitives::epoch_ms(at));
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

    /// Where a call `caller` makes for `purpose` to `target` goes. An action naming
    /// a network becomes that network's proxy, or a refusal while it is not up.
    pub fn rule_on(&self, caller: &str, purpose: &str, target: &WebTarget) -> Ruling {
        let own_ports = if is_this_machine(target) {
            self.own_ports()
        } else {
            Vec::new()
        };
        let (action, rule) = decide(&self.rules(), caller, purpose, target, &own_ports);
        let decision = match action {
            Action::Direct => Decision::Direct,
            Action::Block => Decision::Block(refusal(rule.as_deref())),
            Action::Network(name) => self.through(&name),
        };
        Ruling { decision, rule }
    }
}

fn refusal(rule: Option<&str>) -> String {
    match rule {
        Some(GUARD_LINK_LOCAL) => "a link-local address is never reachable".to_string(),
        Some(GUARD_LOOPBACK) => {
            "a module may not reach this server's own listeners on loopback".to_string()
        }
        Some(id) => format!("rule {id}"),
        None => "the default action is block".to_string(),
    }
}

#[cfg(test)]
mod tests;
