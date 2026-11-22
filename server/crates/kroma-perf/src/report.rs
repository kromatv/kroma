use std::collections::BTreeMap;

use serde::Serialize;

use crate::profiler::{Profiler, Window};
use crate::recent::{Bucket, ScopeKey};
use crate::scope::{now_ms, ScopeKind};
use crate::segment::Descriptor;
use crate::slow::REPEATS_FLAGGED;
use crate::stats::{ScopeStats, SegmentStats, Timing};

const SEGMENTS_LISTED: usize = 300;
const PARTS_LISTED: usize = 12;
const NS_PER_MS: f64 = 1_000_000.0;
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

/// The spread of one timing, in milliseconds.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Spread {
    pub count: u64,
    pub total_ms: f64,
    pub mean_ms: f64,
    pub p50_ms: f64,
    pub p95_ms: f64,
    pub p99_ms: f64,
    pub max_ms: f64,
}

/// A segment named for a reader: its key as a string (it does not fit a
/// JavaScript number), what it is, and where it ran.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Named {
    pub key: String,
    pub kind: String,
    pub label: String,
    pub origin: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartRow {
    #[serde(flatten)]
    pub segment: Named,
    pub per_call: f64,
    pub ms_per_call: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KindRow {
    pub per_call: f64,
    pub ms_per_call: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepeatRow {
    #[serde(flatten)]
    pub segment: Named,
    pub count: u32,
}

/// One request route or job over a window.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopeRow {
    pub kind: ScopeKind,
    pub name: String,
    #[serde(flatten)]
    pub spread: Spread,
    pub server_errors: u64,
    pub client_errors: u64,
    pub segments_per_call: f64,
    pub kinds: BTreeMap<String, KindRow>,
    pub max_segments: u32,
    pub worst_repeat: Option<RepeatRow>,
    pub bytes_per_call: Option<f64>,
    pub parts: Vec<PartRow>,
    pub flags: Vec<Flag>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct CallerRow {
    pub name: String,
    pub count: u64,
}

/// One statement, span or measured call over a window.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentRow {
    #[serde(flatten)]
    pub segment: Named,
    #[serde(flatten)]
    pub spread: Spread,
    pub rows_per_call: f64,
    pub full_scan_steps_per_call: f64,
    pub vm_steps_per_call: f64,
    pub sorts: u64,
    pub auto_indexes: u64,
    pub callers: Vec<CallerRow>,
    pub flags: Vec<Flag>,
}

/// Everything over one window, heaviest first.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub window: Window,
    pub enabled: bool,
    pub generated_at_ms: i64,
    pub requests: Vec<ScopeRow>,
    pub jobs: Vec<ScopeRow>,
    pub segments: Vec<SegmentRow>,
}

impl Profiler {
    pub fn overview(&self, window: Window) -> Overview {
        let bucket = self.window(window);
        let name = |key: u64| self.named(key);
        let mut segments: Vec<SegmentRow> = bucket
            .segments
            .iter()
            .map(|(key, stats)| segment_row(name(*key), stats))
            .collect();
        segments.sort_by(|a, b| b.spread.total_ms.total_cmp(&a.spread.total_ms));
        segments.truncate(SEGMENTS_LISTED);
        Overview {
            window,
            enabled: self.enabled(),
            generated_at_ms: now_ms(),
            requests: scope_rows(&bucket, ScopeKind::Request, &name),
            jobs: scope_rows(&bucket, ScopeKind::Job, &name),
            segments,
        }
    }

    pub(crate) fn named(&self, key: u64) -> Named {
        let Descriptor {
            kind,
            label,
            origin,
        } = self.describe(key).unwrap_or_else(|| Descriptor {
            kind: "unknown".into(),
            label: format!("#{key}"),
            origin: None,
        });
        Named {
            key: key.to_string(),
            kind,
            label,
            origin,
        }
    }
}

fn scope_rows(bucket: &Bucket, kind: ScopeKind, name: &dyn Fn(u64) -> Named) -> Vec<ScopeRow> {
    let mut rows: Vec<ScopeRow> = bucket
        .scopes
        .iter()
        .filter(|(key, _)| key.kind == kind)
        .map(|(key, stats)| scope_row(key, stats, name))
        .collect();
    rows.sort_by(|a, b| b.spread.total_ms.total_cmp(&a.spread.total_ms));
    rows
}

fn scope_row(key: &ScopeKey, stats: &ScopeStats, name: &dyn Fn(u64) -> Named) -> ScopeRow {
    let calls = stats.timing.count.max(1) as f64;
    let spread = spread_of(&stats.timing);
    let worst_repeat = (stats.worst_repeat.count > 1).then(|| RepeatRow {
        segment: name(stats.worst_repeat.key),
        count: stats.worst_repeat.count,
    });
    let bytes_per_call = (stats.sized > 0).then(|| stats.bytes as f64 / stats.sized as f64);
    let mut parts: Vec<PartRow> = stats
        .parts
        .iter()
        .map(|(key, part)| PartRow {
            segment: name(*key),
            per_call: part.count as f64 / calls,
            ms_per_call: part.total_ns as f64 / NS_PER_MS / calls,
        })
        .collect();
    parts.sort_by(|a, b| b.ms_per_call.total_cmp(&a.ms_per_call));
    parts.truncate(PARTS_LISTED);
    let flags = scope_flags(stats, &spread, bytes_per_call);
    ScopeRow {
        kind: key.kind,
        name: key.name.clone(),
        spread,
        server_errors: stats.server_errors,
        client_errors: stats.client_errors,
        segments_per_call: stats.segments as f64 / calls,
        kinds: stats
            .kinds
            .iter()
            .map(|(kind, part)| {
                (
                    kind.clone(),
                    KindRow {
                        per_call: part.count as f64 / calls,
                        ms_per_call: round(part.total_ns as f64 / NS_PER_MS / calls),
                    },
                )
            })
            .collect(),
        max_segments: stats.max_segments,
        worst_repeat,
        bytes_per_call,
        parts,
        flags,
    }
}

fn scope_flags(stats: &ScopeStats, spread: &Spread, bytes_per_call: Option<f64>) -> Vec<Flag> {
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

fn is_cold_outlier(spread: &Spread) -> bool {
    spread.max_ms >= 1_000.0 && spread.max_ms >= 10.0 * spread.p50_ms.max(1.0)
}

fn segment_row(segment: Named, stats: &SegmentStats) -> SegmentRow {
    let calls = stats.timing.count.max(1) as f64;
    let spread = spread_of(&stats.timing);
    let mut callers: Vec<CallerRow> = stats
        .callers
        .iter()
        .map(|(name, count)| CallerRow {
            name: name.clone(),
            count: *count,
        })
        .collect();
    callers.sort_by_key(|c| std::cmp::Reverse(c.count));
    let full_scan_steps_per_call = stats.counters.full_scan_steps as f64 / calls;
    let flags = segment_flags(&segment.kind, stats, &spread, full_scan_steps_per_call);
    SegmentRow {
        segment,
        spread,
        rows_per_call: stats.counters.rows as f64 / calls,
        full_scan_steps_per_call,
        vm_steps_per_call: stats.counters.vm_steps as f64 / calls,
        sorts: stats.counters.sorts,
        auto_indexes: stats.counters.auto_indexes,
        callers,
        flags,
    }
}

fn segment_flags(
    kind: &str,
    stats: &SegmentStats,
    spread: &Spread,
    full_scan_steps_per_call: f64,
) -> Vec<Flag> {
    let slow_ms = if kind == "sql" { 100.0 } else { 250.0 };
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

fn spread_of(timing: &Timing) -> Spread {
    let ms = |ns: u64| round(ns as f64 / NS_PER_MS);
    Spread {
        count: timing.count,
        total_ms: ms(timing.total_ns),
        mean_ms: ms(timing.mean_ns()),
        p50_ms: ms(timing.histogram.quantile(0.5)),
        p95_ms: ms(timing.histogram.quantile(0.95)),
        p99_ms: ms(timing.histogram.quantile(0.99)),
        max_ms: ms(timing.max_ns),
    }
}

pub(crate) fn round(ms: f64) -> f64 {
    (ms * 1_000.0).round() / 1_000.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stats::{Part, Repeat, Run};
    use std::collections::HashMap;

    fn looping_run() -> Run {
        Run {
            elapsed_ns: 14_800_000_000,
            status: Some(200),
            bytes: Some(2 * 1024 * 1024),
            segments: 651,
            kinds: BTreeMap::from([(
                "sql",
                Part {
                    count: 651,
                    total_ns: 900_000_000,
                },
            )]),
            worst_repeat: Repeat { key: 5, count: 217 },
            parts: HashMap::from([(
                5,
                Part {
                    count: 217,
                    total_ns: 300_000_000,
                },
            )]),
        }
    }

    #[test]
    fn a_route_running_one_query_per_episode_is_flagged() {
        let mut stats = ScopeStats::default();
        stats.record(&looping_run());
        let key = ScopeKey {
            kind: ScopeKind::Request,
            name: "GET /api/admin/pipeline/show/{id}".into(),
        };

        let row = scope_row(&key, &stats, &|k| Named {
            key: k.to_string(),
            ..Named::default()
        });

        assert_eq!(row.worst_repeat.as_ref().map(|r| r.count), Some(217));
        assert!(row.flags.contains(&Flag::NPlusOne));
        assert!(row.flags.contains(&Flag::SlowP95));
        assert!(row.flags.contains(&Flag::LargeResponse));
        assert_eq!(row.parts[0].per_call, 217.0);
    }

    #[test]
    fn a_full_scan_is_flagged_per_call_not_in_total() {
        let mut stats = SegmentStats::default();
        let scan = crate::segment::Counters {
            full_scan_steps: 5_000,
            ..Default::default()
        };
        stats.record(2_000_000, &scan, "GET /api/people");

        let row = segment_row(
            Named {
                kind: "sql".into(),
                ..Named::default()
            },
            &stats,
        );

        assert_eq!(row.flags, vec![Flag::FullScan]);
        assert_eq!(row.callers[0].name, "GET /api/people");
    }

    #[test]
    fn one_cold_call_among_fast_ones_reads_as_an_outlier() {
        let spread = Spread {
            p50_ms: 31.0,
            max_ms: 2_288.0,
            ..Spread::default()
        };

        assert!(is_cold_outlier(&spread));
        assert!(!is_cold_outlier(&Spread {
            p50_ms: 300.0,
            max_ms: 1_200.0,
            ..Spread::default()
        }));
    }
}
