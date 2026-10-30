//! The journal of outbound flows: the most recent ones in memory, newest first,
//! and a daily tally per caller, purpose, host and route, written to the
//! database on [`Journal::flush`] so it outlives a restart.

use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::db::Pool;
use crate::db::network_flows::{self, FlowTally};

use super::flow::{Flow, FlowFilter, FlowReport, FlowRoute};

/// How many flows the in-memory journal keeps.
pub const RECENT_CAPACITY: usize = 5000;

const MAX_PENDING_TALLIES: usize = 10_000;
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
struct Tally {
    count: i64,
    bytes_in: i64,
    bytes_out: i64,
    last_at: i64,
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
        let flow = Flow {
            id: self.next_id.fetch_add(1, Ordering::Relaxed) + 1,
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
        let mut recent = self.recent.lock().unwrap_or_else(|e| e.into_inner());
        recent.push_front(flow);
        recent.truncate(RECENT_CAPACITY);
    }

    pub fn recent(&self, filter: &FlowFilter) -> Vec<Flow> {
        let recent = self.recent.lock().unwrap_or_else(|e| e.into_inner());
        recent
            .iter()
            .filter(|flow| filter.admits(flow))
            .take(filter.limit)
            .cloned()
            .collect()
    }

    /// Every `(caller, purpose)` pair the in-memory journal holds.
    pub fn recent_purposes(&self) -> Vec<(String, String)> {
        let recent = self.recent.lock().unwrap_or_else(|e| e.into_inner());
        recent
            .iter()
            .map(|flow| (flow.caller.clone(), flow.purpose.clone()))
            .collect()
    }

    /// Write the tallies gathered since the last flush. A failed write keeps
    /// them for the next one.
    pub fn flush(&self, pool: &Pool) -> anyhow::Result<()> {
        let taken = std::mem::take(&mut *self.pending.lock().unwrap_or_else(|e| e.into_inner()));
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
            let mut pending = self.pending.lock().unwrap_or_else(|e| e.into_inner());
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
            host: flow.host.clone(),
            route: flow.route,
        };
        let delta = Tally {
            count: 1,
            bytes_in: saturating_i64(flow.bytes_in),
            bytes_out: saturating_i64(flow.bytes_out),
            last_at: flow.at,
        };
        let mut pending = self.pending.lock().unwrap_or_else(|e| e.into_inner());
        if pending.len() >= MAX_PENDING_TALLIES && !pending.contains_key(&key) {
            return;
        }
        merge(pending.entry(key).or_default(), delta);
    }
}

fn merge(into: &mut Tally, delta: Tally) {
    into.count += delta.count;
    into.bytes_in = into.bytes_in.saturating_add(delta.bytes_in);
    into.bytes_out = into.bytes_out.saturating_add(delta.bytes_out);
    into.last_at = into.last_at.max(delta.last_at);
}

fn saturating_i64(value: u64) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

fn clipped(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

#[cfg(test)]
mod tests;
