use serde::Serialize;

use crate::report::Spread;
use crate::slow::REPEATS_FLAGGED;
use crate::stats::{ScopeStats, SegmentStats};

const LARGE_RESPONSE_BYTES: f64 = 1024.0 * 1024.0;
const FULL_SCAN_STEPS: f64 = 1_000.0;

/// A problem a row shows by its numbers alone, named the same in the page and
/// in the export so a reader can filter on it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Flag {
    NPlusOne,
    SlowP95,
    ColdOutlier,
    LargeResponse,
    ServerErrors,
    FullScan,
    AutoIndex,
    TempSort,
}

pub(crate) fn scope_flags(
    stats: &ScopeStats,
    spread: &Spread,
    bytes_per_call: Option<f64>,
) -> Vec<Flag> {
    let mut flags = Vec::new();
    if stats.worst_repeat.count >= REPEATS_FLAGGED {
        flags.push(Flag::NPlusOne);
    }
    if spread.p95_ms >= 500.0 {
        flags.push(Flag::SlowP95);
    }
    if is_cold_outlier(spread) {
        flags.push(Flag::ColdOutlier);
    }
    if bytes_per_call.is_some_and(|b| b >= LARGE_RESPONSE_BYTES) {
        flags.push(Flag::LargeResponse);
    }
    if stats.server_errors > 0 {
        flags.push(Flag::ServerErrors);
    }
    flags
}

pub(crate) fn is_cold_outlier(spread: &Spread) -> bool {
    spread.max_ms >= 1_000.0 && spread.max_ms >= 10.0 * spread.p50_ms.max(1.0)
}

pub(crate) fn segment_flags(kind: &str, stats: &SegmentStats, spread: &Spread) -> Vec<Flag> {
    let slow_ms = if kind == "sql" { 100.0 } else { 250.0 };
    let full_scan_steps_per_call =
        stats.counters.full_scan_steps as f64 / stats.timing.count.max(1) as f64;
    let mut flags = Vec::new();
    if spread.p95_ms >= slow_ms {
        flags.push(Flag::SlowP95);
    }
    if is_cold_outlier(spread) {
        flags.push(Flag::ColdOutlier);
    }
    if full_scan_steps_per_call >= FULL_SCAN_STEPS {
        flags.push(Flag::FullScan);
    }
    if stats.counters.auto_indexes > 0 {
        flags.push(Flag::AutoIndex);
    }
    if stats.counters.sorts > 0 && spread.mean_ms >= 1.0 {
        flags.push(Flag::TempSort);
    }
    flags
}
