use std::collections::BTreeMap;

use serde::Serialize;

use crate::flags::{scope_flags, segment_flags};
use crate::profiler::{Profiler, Window};
use crate::recent::{Bucket, ScopeKey};
use crate::scope::{now_ms, ScopeKind};
use crate::segment::Descriptor;
use crate::stats::{Part, ScopeStats, SegmentStats, Timing};

pub use crate::flags::Flag;

const SEGMENTS_LISTED: usize = 300;
const PARTS_LISTED: usize = 12;
const NS_PER_MS: f64 = 1_000_000.0;

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
    let bytes_per_call = (stats.sized > 0).then(|| stats.bytes as f64 / stats.sized as f64);
    let flags = scope_flags(stats, &spread, bytes_per_call);
    ScopeRow {
        kind: key.kind,
        name: key.name.clone(),
        spread,
        server_errors: stats.server_errors,
        client_errors: stats.client_errors,
        segments_per_call: stats.segments as f64 / calls,
        kinds: kind_rows(stats, calls),
        max_segments: stats.max_segments,
        worst_repeat: (stats.worst_repeat.count > 1).then(|| RepeatRow {
            segment: name(stats.worst_repeat.key),
            count: stats.worst_repeat.count,
        }),
        bytes_per_call,
        parts: part_rows(stats, calls, name),
        flags,
    }
}

fn kind_rows(stats: &ScopeStats, calls: f64) -> BTreeMap<String, KindRow> {
    let row = |part: &Part| KindRow {
        per_call: part.count as f64 / calls,
        ms_per_call: round(part.total_ns as f64 / NS_PER_MS / calls),
    };
    stats
        .kinds
        .iter()
        .map(|(kind, part)| (kind.clone(), row(part)))
        .collect()
}

fn part_rows(stats: &ScopeStats, calls: f64, name: &dyn Fn(u64) -> Named) -> Vec<PartRow> {
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
    parts
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
    let flags = segment_flags(&segment.kind, stats, &spread);
    SegmentRow {
        segment,
        spread,
        rows_per_call: stats.counters.rows as f64 / calls,
        full_scan_steps_per_call: stats.counters.full_scan_steps as f64 / calls,
        sorts: stats.counters.sorts,
        auto_indexes: stats.counters.auto_indexes,
        callers,
        flags,
    }
}

fn spread_of(timing: &Timing) -> Spread {
    let ms = |ns: u64| round(ns as f64 / NS_PER_MS);
    Spread {
        count: timing.count,
        total_ms: ms(timing.total_ns),
        mean_ms: ms(timing.mean_ns()),
        p50_ms: ms(timing.histogram.quantile(0.5).min(timing.max_ns)),
        p95_ms: ms(timing.histogram.quantile(0.95).min(timing.max_ns)),
        p99_ms: ms(timing.histogram.quantile(0.99).min(timing.max_ns)),
        max_ms: ms(timing.max_ns),
    }
}

pub(crate) fn round(ms: f64) -> f64 {
    (ms * 1_000.0).round() / 1_000.0
}

#[cfg(test)]
mod tests;
