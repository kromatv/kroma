use std::collections::{HashMap, VecDeque};

use serde::{Deserialize, Serialize};

use crate::scope::ScopeKind;
use crate::segment::Counters;
use crate::stats::{Run, ScopeStats, SegmentStats};

pub(crate) const BUCKET_MS: i64 = 5 * 60 * 1_000;
pub(crate) const HOUR_MS: i64 = 60 * 60 * 1_000;

/// A request route or a job, the unit [`ScopeStats`] are kept by.
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct ScopeKey {
    pub kind: ScopeKind,
    pub name: String,
}

/// Everything measured over one stretch of time.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Bucket {
    pub start_ms: i64,
    #[serde(with = "pairs")]
    pub scopes: HashMap<ScopeKey, ScopeStats>,
    pub segments: HashMap<u64, SegmentStats>,
}

impl Bucket {
    pub(crate) fn starting(start_ms: i64) -> Bucket {
        Bucket {
            start_ms,
            ..Bucket::default()
        }
    }

    pub fn merge(&mut self, other: &Bucket) {
        for (key, stats) in &other.scopes {
            self.scopes.entry(key.clone()).or_default().merge(stats);
        }
        for (key, stats) in &other.segments {
            self.segments.entry(*key).or_default().merge(stats);
        }
    }

    pub fn is_empty(&self) -> bool {
        self.scopes.is_empty() && self.segments.is_empty()
    }
}

/// The last hour in five-minute buckets, and the hour so far merged for the
/// store. The open bucket is never in `hour`: a closed one moves there.
pub(crate) struct Recent {
    open: Bucket,
    closed: VecDeque<Bucket>,
    hour: Bucket,
}

impl Recent {
    pub fn new(now_ms: i64) -> Recent {
        Recent {
            open: Bucket::starting(floor(now_ms, BUCKET_MS)),
            closed: VecDeque::new(),
            hour: Bucket::starting(floor(now_ms, HOUR_MS)),
        }
    }

    pub fn record_segment(&mut self, key: u64, nanos: u64, counters: &Counters, caller: &str) {
        self.open
            .segments
            .entry(key)
            .or_default()
            .record(nanos, counters, caller);
    }

    pub fn record_scope(&mut self, key: ScopeKey, run: &Run) {
        self.open.scopes.entry(key).or_default().record(run);
    }

    /// Closes the open bucket once its five minutes are over. Returns the hours
    /// whose content changed, for the store to write: the hour so far, and the
    /// one before it when this close finished it.
    pub fn rotate(&mut self, now_ms: i64) -> Vec<Bucket> {
        if now_ms < self.open.start_ms + BUCKET_MS {
            return Vec::new();
        }
        let closed = std::mem::replace(&mut self.open, Bucket::starting(floor(now_ms, BUCKET_MS)));
        let mut changed = Vec::new();
        if floor(closed.start_ms, HOUR_MS) != self.hour.start_ms {
            let finished = std::mem::replace(
                &mut self.hour,
                Bucket::starting(floor(closed.start_ms, HOUR_MS)),
            );
            if !finished.is_empty() {
                changed.push(finished);
            }
        }
        self.hour.merge(&closed);
        self.closed.push_back(closed);
        while self
            .closed
            .front()
            .is_some_and(|b| b.start_ms < now_ms - HOUR_MS)
        {
            self.closed.pop_front();
        }
        if !self.hour.is_empty() {
            changed.push(self.hour.clone());
        }
        changed
    }

    /// The last hour merged into one bucket, the open bucket included.
    pub fn last_hour(&self, now_ms: i64) -> Bucket {
        let mut merged = Bucket::starting(now_ms - HOUR_MS);
        for bucket in self
            .closed
            .iter()
            .filter(|b| b.start_ms >= now_ms - HOUR_MS)
        {
            merged.merge(bucket);
        }
        merged.merge(&self.open);
        merged
    }

    /// What is measured but not yet in the store: the open bucket, and the hour
    /// so far when no store took it.
    pub fn unstored(&self, with_hour: bool) -> Bucket {
        let mut merged = self.open.clone();
        if with_hour {
            merged.merge(&self.hour);
        }
        merged
    }
}

pub(crate) fn floor(ms: i64, step: i64) -> i64 {
    ms - ms.rem_euclid(step)
}

mod pairs {
    use std::collections::HashMap;
    use std::hash::Hash;

    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S: Serializer, K: Serialize, V: Serialize>(
        map: &HashMap<K, V>,
        out: S,
    ) -> Result<S::Ok, S::Error> {
        out.collect_seq(map.iter())
    }

    pub fn deserialize<'de, D, K, V>(input: D) -> Result<HashMap<K, V>, D::Error>
    where
        D: Deserializer<'de>,
        K: Deserialize<'de> + Eq + Hash,
        V: Deserialize<'de>,
    {
        Ok(Vec::<(K, V)>::deserialize(input)?.into_iter().collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const T0: i64 = 1_800_000_000_000 - (1_800_000_000_000 % HOUR_MS);

    fn route(name: &str) -> ScopeKey {
        ScopeKey {
            kind: ScopeKind::Request,
            name: name.into(),
        }
    }

    fn one_request(recent: &mut Recent, ms: u64) {
        let run = Run {
            elapsed_ns: ms * 1_000_000,
            ..Run::default()
        };
        recent.record_scope(route("GET /api/home"), &run);
    }

    #[test]
    fn nothing_moves_before_the_bucket_is_over() {
        let mut recent = Recent::new(T0);
        one_request(&mut recent, 10);

        let changed = recent.rotate(T0 + BUCKET_MS - 1);

        assert!(changed.is_empty());
    }

    #[test]
    fn a_closed_bucket_joins_the_hour_the_store_writes() {
        let mut recent = Recent::new(T0);
        one_request(&mut recent, 10);

        let changed = recent.rotate(T0 + BUCKET_MS);

        assert_eq!(changed.len(), 1);
        assert_eq!(changed[0].start_ms, T0);
        assert_eq!(changed[0].scopes[&route("GET /api/home")].timing.count, 1);
    }

    #[test]
    fn the_last_close_of_an_hour_hands_over_the_finished_hour() {
        let mut recent = Recent::new(T0 + HOUR_MS - BUCKET_MS);
        one_request(&mut recent, 10);
        recent.rotate(T0 + HOUR_MS);
        one_request(&mut recent, 20);

        let changed = recent.rotate(T0 + HOUR_MS + BUCKET_MS);

        assert_eq!(
            changed.iter().map(|b| b.start_ms).collect::<Vec<_>>(),
            vec![T0, T0 + HOUR_MS]
        );
    }

    #[test]
    fn the_last_hour_holds_the_open_bucket_and_forgets_older_ones() {
        let mut recent = Recent::new(T0);
        one_request(&mut recent, 10);
        recent.rotate(T0 + HOUR_MS + BUCKET_MS);
        one_request(&mut recent, 30);

        let hour = recent.last_hour(T0 + HOUR_MS + BUCKET_MS + 1);

        assert_eq!(hour.scopes[&route("GET /api/home")].timing.count, 1);
    }
}
