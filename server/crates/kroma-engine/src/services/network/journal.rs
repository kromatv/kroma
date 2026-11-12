//! The journal of outbound flows: the most recent ones in memory, newest first,
//! and a daily tally per caller, purpose, host and route, written to the
//! database on [`Journal::flush`] so it outlives a restart.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, PoisonError};

use crate::db::network_flows::{self, FlowTally};
use crate::db::Pool;

use kroma_http::address::is_public;
use kroma_module_host::NetworkFlow;

use super::flow::{Flow, FlowFilter, FlowPage, FlowReport, FlowRoute};

pub const RECENT_CAPACITY: usize = 5000;

/// The method the gateway files a connection under, until the module says what
/// went over it.
pub const CARRIED_METHOD: &str = "CONNECT";

/// The host a public address is tallied under. A torrent's peers are thousands
/// of addresses a day, and the list of them says what a household downloads.
pub const TALLIED_PUBLIC_ADDRESS: &str = "*";

pub(super) const MAX_PENDING_TALLIES: usize = 10_000;
const MAX_PURPOSE_CHARS: usize = 64;
const MAX_METHOD_CHARS: usize = 16;
const MAX_HOST_CHARS: usize = 253;
const MAX_ERROR_CHARS: usize = 300;
const MAX_RULE_CHARS: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct TallyKey {
    day: i64,
    caller: String,
    purpose: String,
    host: String,
    route: FlowRoute,
}

#[derive(Debug, Clone, Copy, Default)]
pub(super) struct Tally {
    pub(super) count: i64,
    pub(super) bytes_in: i64,
    pub(super) bytes_out: i64,
    pub(super) last_at: i64,
}

#[derive(Default)]
pub struct Journal {
    recent: Mutex<VecDeque<Flow>>,
    pending: Mutex<HashMap<TallyKey, Tally>>,
    next_id: AtomicU64,
}

impl Journal {
    /// File one flow `caller` reported at `at_ms` (epoch milliseconds).
    pub fn record(&self, caller: &str, report: FlowReport, at_ms: i64) {
        let mut flow = Flow {
            id: 0,
            at: at_ms,
            caller: clipped(caller, MAX_HOST_CHARS),
            purpose: clipped(&report.purpose, MAX_PURPOSE_CHARS),
            method: clipped(&report.method, MAX_METHOD_CHARS),
            host: clipped(&report.host, MAX_HOST_CHARS),
            port: report.port,
            route: report.route,
            status: report.status,
            bytes_in: report.bytes_in,
            bytes_out: report.bytes_out,
            duration_ms: report.duration_ms,
            error: report.error.map(|e| clipped(&e, MAX_ERROR_CHARS)),
            rule: report.rule.map(|r| clipped(&r, MAX_RULE_CHARS)),
        };
        self.tally(&flow);
        let mut recent = self.recent.lock().unwrap_or_else(PoisonError::into_inner);
        flow.id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        recent.push_front(flow);
        recent.truncate(RECENT_CAPACITY);
    }

    /// Add what a module saw of a call the gateway carried to the connection the
    /// gateway filed: its method, its status, the error it met. A report that
    /// matches no connection is dropped, since the gateway is what says a call
    /// happened.
    pub fn annotate(&self, caller: &str, report: &NetworkFlow) {
        let mut recent = self.recent.lock().unwrap_or_else(PoisonError::into_inner);
        let filed = recent.iter_mut().find(|flow| {
            flow.status.is_none()
                && flow.method == CARRIED_METHOD
                && flow.caller == caller
                && flow.purpose == report.purpose
                && flow.host == report.host
                && flow.port == report.port
        });
        if let Some(flow) = filed {
            flow.method = clipped(&report.method, MAX_METHOD_CHARS);
            flow.status = report.status;
            if flow.error.is_none() {
                flow.error = report.error.as_deref().map(|e| clipped(e, MAX_ERROR_CHARS));
            }
        }
    }

    pub fn page(&self, filter: &FlowFilter) -> FlowPage {
        let recent = self.recent.lock().unwrap_or_else(PoisonError::into_inner);
        let mut flows = Vec::new();
        let mut total = 0;
        for flow in recent.iter().filter(|flow| filter.admits(flow)) {
            if total >= filter.offset && flows.len() < filter.limit {
                flows.push(flow.clone());
            }
            total += 1;
        }
        FlowPage { flows, total }
    }

    /// Every `(caller, purpose)` pair the in-memory journal holds.
    pub fn recent_purposes(&self) -> Vec<(String, String)> {
        let recent = self.recent.lock().unwrap_or_else(PoisonError::into_inner);
        recent
            .iter()
            .map(|flow| (flow.caller.clone(), flow.purpose.clone()))
            .collect()
    }

    /// Write the tallies gathered since the last flush. A failed write keeps
    /// them for the next one.
    pub fn flush(&self, pool: &Pool) -> anyhow::Result<()> {
        let taken = std::mem::take(&mut *self.pending.lock().unwrap_or_else(PoisonError::into_inner));
        let deltas: Vec<FlowTally> = taken
            .iter()
            .map(|(key, tally)| FlowTally {
                day: key.day,
                caller: key.caller.clone(),
                purpose: key.purpose.clone(),
                host: key.host.clone(),
                route: key.route.as_str().to_string(),
                verdict: key.route.verdict().as_str().to_string(),
                count: tally.count,
                bytes_in: tally.bytes_in,
                bytes_out: tally.bytes_out,
                last_at: tally.last_at,
            })
            .collect();
        let written = network_flows::add(pool, &deltas);
        if written.is_err() {
            let mut pending = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
            for (key, tally) in taken {
                merge(pending.entry(key).or_default(), tally);
            }
        }
        written
    }

    fn tally(&self, flow: &Flow) {
        let key = TallyKey {
            day: network_flows::day_of(flow.at),
            caller: flow.caller.clone(),
            purpose: flow.purpose.clone(),
            host: tallied_host(&flow.host),
            route: flow.route,
        };
        let delta = Tally {
            count: 1,
            bytes_in: saturating_i64(flow.bytes_in),
            bytes_out: saturating_i64(flow.bytes_out),
            last_at: flow.at,
        };
        let mut pending = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
        if pending.len() >= MAX_PENDING_TALLIES && !pending.contains_key(&key) {
            return;
        }
        merge(pending.entry(key).or_default(), delta);
    }
}

fn tallied_host(host: &str) -> String {
    match host.parse::<std::net::IpAddr>() {
        Ok(address) if is_public(address) => TALLIED_PUBLIC_ADDRESS.to_string(),
        _ => host.to_string(),
    }
}

pub(super) fn merge(into: &mut Tally, delta: Tally) {
    into.count += delta.count;
    into.bytes_in = into.bytes_in.saturating_add(delta.bytes_in);
    into.bytes_out = into.bytes_out.saturating_add(delta.bytes_out);
    into.last_at = into.last_at.max(delta.last_at);
}

pub(super) fn saturating_i64(value: u64) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

pub(super) fn clipped(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

#[cfg(test)]
mod tests;
