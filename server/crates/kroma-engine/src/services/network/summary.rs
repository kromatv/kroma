//! The daily tallies over a window of days, as the admin API serves them.

use serde::Serialize;

use crate::db::Pool;
use crate::db::network_flows::{self, FlowTally, FlowTotals};

/// The widest window a summary covers, which is also how long a tally is kept.
pub const MAX_DAYS: u32 = network_flows::RETENTION_DAYS as u32;

const MAX_ROWS: usize = 500;
const DAY_MS: i64 = 86_400_000;

/// `since` is epoch milliseconds: the start of the first UTC day counted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub since: i64,
    pub totals: Totals,
    pub rows: Vec<SummaryRow>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Totals {
    pub flows: i64,
    pub blocked: i64,
    pub bytes_in: i64,
    pub bytes_out: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryRow {
    pub caller: String,
    pub purpose: String,
    pub host: String,
    pub route: String,
    pub verdict: String,
    pub count: i64,
    pub bytes_in: i64,
    pub bytes_out: i64,
    pub last_at: i64,
}

/// The last `days` UTC days up to `now_ms`, today included; `days` is clamped
/// to `1..=MAX_DAYS`.
pub fn summarize(pool: &Pool, days: u32, now_ms: i64) -> anyhow::Result<Summary> {
    let days = i64::from(days.clamp(1, MAX_DAYS));
    let since_day = network_flows::day_of(now_ms) - (days - 1);
    let FlowTotals {
        flows,
        blocked,
        bytes_in,
        bytes_out,
    } = network_flows::totals_since(pool, since_day)?;
    let rows = network_flows::since(pool, since_day, MAX_ROWS)?
        .into_iter()
        .map(SummaryRow::from)
        .collect();
    Ok(Summary {
        since: since_day * DAY_MS,
        totals: Totals {
            flows,
            blocked,
            bytes_in,
            bytes_out,
        },
        rows,
    })
}

impl From<FlowTally> for SummaryRow {
    fn from(tally: FlowTally) -> Self {
        Self {
            caller: tally.caller,
            purpose: tally.purpose,
            host: tally.host,
            route: tally.route,
            verdict: tally.verdict,
            count: tally.count,
            bytes_in: tally.bytes_in,
            bytes_out: tally.bytes_out,
            last_at: tally.last_at,
        }
    }
}
