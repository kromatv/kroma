use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;

use super::{inbound, summary, Arrival, FlowFilter, FlowPage, FlowReport, InboundSummary, Network, Summary, CORE};

pub const CORE_PURPOSES: &[&str] = &[
    "address", "ai", "artwork", "email", "metadata", "push", "registry", "stats", "themes",
    "updates",
];

pub const FLUSH_EVERY: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct CallerPurpose {
    pub caller: String,
    pub purpose: String,
}

impl Network {
    pub fn record(&self, caller: &str, report: FlowReport) {
        self.journal
            .record(caller, report, kroma_primitives::now_ms());
    }

    pub fn flows(&self, filter: &FlowFilter) -> FlowPage {
        self.journal.page(filter)
    }

    /// File one request a client made of this server.
    pub fn record_arrival(&self, arrival: Arrival) {
        self.inbound.record(arrival, kroma_primitives::now_ms());
    }

    /// The last `days` days of incoming tallies, flushing what is pending first.
    pub fn inbound(&self, days: u32) -> anyhow::Result<InboundSummary> {
        self.flush()?;
        inbound::summarize(&self.db, days, kroma_primitives::now_ms())
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
        let outbound = self.journal.flush(&self.db);
        self.inbound.flush(&self.db)?;
        outbound
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
}
