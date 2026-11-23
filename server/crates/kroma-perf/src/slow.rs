use std::collections::{BTreeMap, VecDeque};

use serde::{Deserialize, Serialize};

use crate::scope::{Event, Scope};
use crate::stats::{Part, Repeat, Run};

pub(crate) const SLOW_MS: u64 = 250;
pub(crate) const REPEATS_FLAGGED: u32 = 20;
const KEPT: usize = 300;
const REPEATS_LISTED: usize = 5;

/// One request worth looking at after the fact: slower than the threshold, or
/// running one segment over and over. Carries its whole waterfall.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SlowRequest {
    pub id: u64,
    pub at_ms: i64,
    pub name: String,
    pub status: Option<u16>,
    pub total_us: u64,
    pub kinds: BTreeMap<String, Part>,
    pub segments: u32,
    pub bytes: Option<u64>,
    pub repeats: Vec<Repeat>,
    pub events: Vec<Event>,
    pub dropped_events: u32,
}

impl SlowRequest {
    pub(crate) fn worth_keeping(run: &Run) -> bool {
        run.elapsed_ns >= SLOW_MS * 1_000_000 || run.worst_repeat.count >= REPEATS_FLAGGED
    }

    pub(crate) fn of(scope: &Scope, run: &Run) -> SlowRequest {
        let trace = scope.0.trace.lock().unwrap();
        let mut repeats: Vec<Repeat> = trace
            .parts
            .iter()
            .map(|(key, part)| Repeat {
                key: *key,
                count: u32::try_from(part.count).unwrap_or(u32::MAX),
            })
            .collect();
        repeats.sort_by_key(|r| std::cmp::Reverse(r.count));
        repeats.truncate(REPEATS_LISTED);
        SlowRequest {
            id: scope.id(),
            at_ms: scope.0.started_ms,
            name: scope.name().to_string(),
            status: run.status,
            total_us: run.elapsed_ns / 1_000,
            kinds: run
                .kinds
                .iter()
                .map(|(kind, part)| ((*kind).to_string(), *part))
                .collect(),
            segments: run.segments,
            bytes: run.bytes,
            repeats,
            events: trace.events.clone(),
            dropped_events: trace.dropped_events,
        }
    }
}

/// The most recent slow requests, newest last, and how many of the newest a
/// store has not taken yet.
#[derive(Default)]
pub(crate) struct SlowRing {
    kept: VecDeque<SlowRequest>,
    unsaved: usize,
}

impl SlowRing {
    pub fn push(&mut self, request: SlowRequest) {
        if self.kept.len() == KEPT {
            self.kept.pop_front();
        }
        self.kept.push_back(request);
        self.unsaved = (self.unsaved + 1).min(KEPT);
    }

    pub fn list(&self) -> Vec<SlowRequest> {
        self.kept.iter().cloned().collect()
    }

    pub fn find(&self, id: u64) -> Option<SlowRequest> {
        self.kept.iter().find(|r| r.id == id).cloned()
    }

    pub fn take_unsaved(&mut self) -> Vec<SlowRequest> {
        let unsaved = std::mem::take(&mut self.unsaved);
        let from = self.kept.len() - unsaved;
        self.kept.iter().skip(from).cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(ms: u64, repeat: u32) -> Run {
        Run {
            elapsed_ns: ms * 1_000_000,
            worst_repeat: Repeat {
                key: 1,
                count: repeat,
            },
            ..Run::default()
        }
    }

    fn request(id: u64) -> SlowRequest {
        SlowRequest {
            id,
            at_ms: 0,
            name: "GET /api/x".into(),
            status: Some(200),
            total_us: 0,
            kinds: BTreeMap::new(),
            segments: 0,
            bytes: None,
            repeats: Vec::new(),
            events: Vec::new(),
            dropped_events: 0,
        }
    }

    #[test]
    fn a_fast_request_with_a_loop_of_queries_is_kept() {
        assert!(SlowRequest::worth_keeping(&run(5, REPEATS_FLAGGED)));
        assert!(SlowRequest::worth_keeping(&run(SLOW_MS, 1)));
        assert!(!SlowRequest::worth_keeping(&run(
            SLOW_MS - 1,
            REPEATS_FLAGGED - 1
        )));
    }

    #[test]
    fn a_store_takes_each_slow_request_once() {
        let mut ring = SlowRing::default();
        ring.push(request(1));
        ring.take_unsaved();
        ring.push(request(2));

        let taken: Vec<u64> = ring.take_unsaved().iter().map(|r| r.id).collect();

        assert_eq!(taken, vec![2]);
        assert!(ring.take_unsaved().is_empty());
    }

    #[test]
    fn the_ring_drops_the_oldest_when_full() {
        let mut ring = SlowRing::default();

        for id in 0..(KEPT as u64 + 1) {
            ring.push(request(id));
        }

        assert!(ring.find(0).is_none());
        assert_eq!(ring.list().len(), KEPT);
    }
}
