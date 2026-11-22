use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};

use crate::histogram::Histogram;
use crate::segment::Counters;

const CALLERS_KEPT: usize = 16;
const PARTS_KEPT: usize = 32;
const OTHER_CALLERS: &str = "(other)";

/// How often something ran and how long it took.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Timing {
    pub count: u64,
    pub total_ns: u64,
    pub max_ns: u64,
    pub histogram: Histogram,
}

impl Timing {
    pub fn record(&mut self, nanos: u64) {
        self.count += 1;
        self.total_ns = self.total_ns.saturating_add(nanos);
        self.max_ns = self.max_ns.max(nanos);
        self.histogram.record(nanos);
    }

    pub fn merge(&mut self, other: &Timing) {
        self.count += other.count;
        self.total_ns = self.total_ns.saturating_add(other.total_ns);
        self.max_ns = self.max_ns.max(other.max_ns);
        self.histogram.merge(&other.histogram);
    }

    pub fn mean_ns(&self) -> u64 {
        self.total_ns.checked_div(self.count).unwrap_or(0)
    }
}

/// Everything known about one segment key over a stretch of time, and which
/// scopes ran it.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SegmentStats {
    pub timing: Timing,
    pub counters: Counters,
    pub callers: HashMap<String, u64>,
}

impl SegmentStats {
    pub fn record(&mut self, nanos: u64, counters: &Counters, caller: &str) {
        self.timing.record(nanos);
        self.counters.add(counters);
        count_caller(&mut self.callers, caller, 1);
    }

    pub fn merge(&mut self, other: &SegmentStats) {
        self.timing.merge(&other.timing);
        self.counters.add(&other.counters);
        for (caller, n) in &other.callers {
            count_caller(&mut self.callers, caller, *n);
        }
    }
}

fn count_caller(callers: &mut HashMap<String, u64>, caller: &str, n: u64) {
    let slot = if callers.contains_key(caller) || callers.len() < CALLERS_KEPT {
        caller
    } else {
        OTHER_CALLERS
    };
    *callers.entry(slot.to_string()).or_default() += n;
}

/// The segment a scope ran most often in one run, and how often.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Repeat {
    pub key: u64,
    pub count: u32,
}

/// The time one scope spent in one segment key, summed over its runs.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Part {
    pub count: u64,
    pub total_ns: u64,
}

/// What one finished run of a scope adds to its [`ScopeStats`].
#[derive(Clone, Debug, Default)]
pub struct Run {
    pub elapsed_ns: u64,
    pub status: Option<u16>,
    pub bytes: Option<u64>,
    pub segments: u32,
    pub kinds: BTreeMap<&'static str, Part>,
    pub worst_repeat: Repeat,
    pub parts: HashMap<u64, Part>,
}

/// Everything known about one request route or job over a stretch of time.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScopeStats {
    pub timing: Timing,
    pub server_errors: u64,
    pub client_errors: u64,
    pub bytes: u64,
    pub sized: u64,
    pub segments: u64,
    pub kinds: BTreeMap<String, Part>,
    pub max_segments: u32,
    pub worst_repeat: Repeat,
    pub parts: HashMap<u64, Part>,
}

impl ScopeStats {
    pub fn record(&mut self, run: &Run) {
        self.timing.record(run.elapsed_ns);
        self.count_status(run.status);
        if let Some(bytes) = run.bytes {
            self.bytes += bytes;
            self.sized += 1;
        }
        self.segments += u64::from(run.segments);
        for (kind, part) in &run.kinds {
            add_part(self.kinds.entry((*kind).to_string()).or_default(), part);
        }
        self.max_segments = self.max_segments.max(run.segments);
        self.keep_worse_repeat(run.worst_repeat);
        self.add_parts(&run.parts);
    }

    pub fn merge(&mut self, other: &ScopeStats) {
        self.timing.merge(&other.timing);
        self.server_errors += other.server_errors;
        self.client_errors += other.client_errors;
        self.bytes += other.bytes;
        self.sized += other.sized;
        self.segments += other.segments;
        for (kind, part) in &other.kinds {
            add_part(self.kinds.entry(kind.clone()).or_default(), part);
        }
        self.max_segments = self.max_segments.max(other.max_segments);
        self.keep_worse_repeat(other.worst_repeat);
        self.add_parts(&other.parts);
    }

    fn count_status(&mut self, status: Option<u16>) {
        match status {
            Some(500..) => self.server_errors += 1,
            Some(400..500) => self.client_errors += 1,
            _ => {}
        }
    }

    fn keep_worse_repeat(&mut self, repeat: Repeat) {
        if repeat.count > self.worst_repeat.count {
            self.worst_repeat = repeat;
        }
    }

    fn add_parts(&mut self, parts: &HashMap<u64, Part>) {
        for (key, part) in parts {
            add_part(self.parts.entry(*key).or_default(), part);
        }
        if self.parts.len() > PARTS_KEPT {
            keep_heaviest(&mut self.parts);
        }
    }
}

fn add_part(into: &mut Part, part: &Part) {
    into.count += part.count;
    into.total_ns = into.total_ns.saturating_add(part.total_ns);
}

fn keep_heaviest(parts: &mut HashMap<u64, Part>) {
    let mut ranked: Vec<(u64, Part)> = parts.drain().collect();
    ranked.sort_by_key(|(_, part)| std::cmp::Reverse(part.total_ns));
    ranked.truncate(PARTS_KEPT);
    parts.extend(ranked);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(ms: u64, status: u16, repeat: u32) -> Run {
        Run {
            elapsed_ns: ms * 1_000_000,
            status: Some(status),
            bytes: Some(1_000),
            segments: repeat,
            kinds: BTreeMap::from([(
                "sql",
                Part {
                    count: u64::from(repeat),
                    total_ns: ms * 500_000,
                },
            )]),
            worst_repeat: Repeat {
                key: 7,
                count: repeat,
            },
            parts: HashMap::from([(
                7,
                Part {
                    count: u64::from(repeat),
                    total_ns: ms * 500_000,
                },
            )]),
        }
    }

    #[test]
    fn a_run_counts_its_status_class() {
        let mut stats = ScopeStats::default();

        stats.record(&run(10, 200, 1));
        stats.record(&run(10, 404, 1));
        stats.record(&run(10, 503, 1));

        assert_eq!(
            (stats.timing.count, stats.client_errors, stats.server_errors),
            (3, 1, 1)
        );
    }

    #[test]
    fn the_worst_repeat_survives_a_merge() {
        let mut quiet = ScopeStats::default();
        quiet.record(&run(5, 200, 2));
        let mut chatty = ScopeStats::default();
        chatty.record(&run(900, 200, 650));

        quiet.merge(&chatty);

        assert_eq!(quiet.worst_repeat.count, 650);
        assert_eq!(quiet.max_segments, 650);
        assert_eq!(quiet.parts[&7].count, 652);
    }

    #[test]
    fn only_the_heaviest_parts_are_kept() {
        let mut stats = ScopeStats::default();
        let parts = (0..100u64)
            .map(|k| {
                (
                    k,
                    Part {
                        count: 1,
                        total_ns: k,
                    },
                )
            })
            .collect();

        stats.record(&Run {
            parts,
            ..Run::default()
        });

        assert_eq!(stats.parts.len(), PARTS_KEPT);
        assert!(stats.parts.contains_key(&99));
        assert!(!stats.parts.contains_key(&0));
    }

    #[test]
    fn callers_past_the_cap_fold_into_one_entry() {
        let mut stats = SegmentStats::default();

        for i in 0..40 {
            stats.record(1_000, &Counters::default(), &format!("GET /api/r{i}"));
        }

        assert_eq!(stats.callers.len(), CALLERS_KEPT + 1);
        assert_eq!(stats.callers[OTHER_CALLERS], 40 - CALLERS_KEPT as u64);
    }
}
