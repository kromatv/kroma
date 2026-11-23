use std::collections::{BTreeMap, BTreeSet};

use serde::Serialize;

use crate::profiler::{Profiler, Window};
use crate::report::{round, Named, RepeatRow};
use crate::scope::{now_ms, Event};
use crate::slow::SlowRequest;
use crate::stats::Part;

/// How often a scope ran one kind of segment, and for how long in all.
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct KindTotal {
    pub count: u64,
    pub ms: f64,
}

/// One segment of a slow request, placed on its timeline.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WaterfallStep {
    pub offset_ms: f64,
    pub duration_ms: f64,
    pub rows: u64,
    #[serde(flatten)]
    pub segment: Named,
}

/// A slow request as a reader sees it. Listed, its waterfall is left empty.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlowReport {
    pub id: String,
    pub at_ms: i64,
    pub name: String,
    pub status: Option<u16>,
    pub total_ms: f64,
    pub kinds: BTreeMap<String, KindTotal>,
    pub segments: u32,
    pub bytes: Option<u64>,
    pub repeats: Vec<RepeatRow>,
    pub dropped_steps: u32,
    pub waterfall: Vec<WaterfallStep>,
}

impl Profiler {
    /// The slow requests of `window`, newest first, without their waterfalls.
    pub fn slow_list(&self, window: Window) -> Vec<SlowReport> {
        let mut listed: Vec<SlowReport> = self
            .slow_in(window)
            .iter()
            .rev()
            .map(|request| SlowReport {
                waterfall: Vec::new(),
                ..self.slow_report_of(request)
            })
            .collect();
        listed.truncate(500);
        listed
    }

    /// One slow request with its waterfall.
    pub fn slow_report(&self, id: u64) -> Option<SlowReport> {
        self.slow_request(id)
            .map(|request| self.slow_report_of(&request))
    }

    pub(crate) fn slow_in(&self, window: Window) -> Vec<SlowRequest> {
        let since = now_ms() - window.millis();
        let mut seen = BTreeSet::new();
        let mut requests: Vec<SlowRequest> = self
            .slow()
            .into_iter()
            .chain(self.store_slow_since(since))
            .filter(|request| request.at_ms >= since && seen.insert(request.id))
            .collect();
        requests.sort_by_key(|request| request.at_ms);
        requests
    }

    pub(crate) fn slow_report_of(&self, request: &SlowRequest) -> SlowReport {
        SlowReport {
            id: request.id.to_string(),
            at_ms: request.at_ms,
            name: request.name.clone(),
            status: request.status,
            total_ms: ms(request.total_us),
            kinds: totals(&request.kinds),
            segments: request.segments,
            bytes: request.bytes,
            repeats: request
                .repeats
                .iter()
                .map(|r| RepeatRow {
                    segment: self.named(r.key),
                    count: r.count,
                })
                .collect(),
            dropped_steps: request.dropped_events,
            waterfall: request.events.iter().map(|e| self.step_of(e)).collect(),
        }
    }

    fn step_of(&self, event: &Event) -> WaterfallStep {
        WaterfallStep {
            offset_ms: ms(event.offset_us),
            duration_ms: ms(event.duration_us),
            rows: event.rows,
            segment: self.named(event.key),
        }
    }
}

fn ms(us: u64) -> f64 {
    round(us as f64 / 1_000.0)
}

fn totals(kinds: &BTreeMap<String, Part>) -> BTreeMap<String, KindTotal> {
    kinds
        .iter()
        .map(|(kind, part)| {
            (
                kind.clone(),
                KindTotal {
                    count: part.count,
                    ms: round(part.total_ns as f64 / 1_000_000.0),
                },
            )
        })
        .collect()
}
