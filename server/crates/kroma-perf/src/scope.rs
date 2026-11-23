use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap};
use std::future::Future;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::segment::{Counters, Segment};
use crate::stats::{Part, Repeat, Run};

const EVENTS_KEPT: usize = 400;

static NEXT_ID: LazyLock<AtomicU64> =
    LazyLock::new(|| AtomicU64::new(u64::try_from(now_ms()).unwrap_or(0) * 1_000));

tokio::task_local! {
    static TASK_SCOPE: Scope;
}

thread_local! {
    static THREAD_SCOPE: RefCell<Option<Scope>> = const { RefCell::new(None) };
}

/// What a scope measures: one HTTP request, or one run of a background job.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScopeKind {
    Request,
    Job,
}

/// One segment as it happened inside a scope, for the waterfall of a slow run.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Event {
    pub key: u64,
    pub offset_us: u64,
    pub duration_us: u64,
    pub rows: u64,
}

#[derive(Default)]
pub(crate) struct Trace {
    pub segments: u32,
    pub kinds: BTreeMap<&'static str, Part>,
    pub counters: Counters,
    pub parts: HashMap<u64, Part>,
    pub events: Vec<Event>,
    pub dropped_events: u32,
}

pub(crate) struct Inner {
    pub id: u64,
    pub kind: ScopeKind,
    pub name: String,
    pub started: Instant,
    pub started_ms: i64,
    pub trace: Mutex<Trace>,
}

/// One request or job being measured. Every segment that runs while it is
/// current, on its task or on a thread it was carried to, is counted in it.
#[derive(Clone)]
pub struct Scope(pub(crate) Arc<Inner>);

impl Scope {
    pub(crate) fn new(kind: ScopeKind, name: String) -> Scope {
        Scope(Arc::new(Inner {
            id: NEXT_ID.fetch_add(1, Ordering::Relaxed),
            kind,
            name,
            started: Instant::now(),
            started_ms: now_ms(),
            trace: Mutex::new(Trace::default()),
        }))
    }

    pub fn id(&self) -> u64 {
        self.0.id
    }

    pub fn name(&self) -> &str {
        &self.0.name
    }

    /// The scope work on this thread or task counts toward, if any.
    pub fn current() -> Option<Scope> {
        THREAD_SCOPE
            .with(|slot| slot.borrow().clone())
            .or_else(|| TASK_SCOPE.try_with(Scope::clone).ok())
    }

    /// Runs `future` with this scope current for every poll of it.
    pub fn run<F: Future>(self, future: F) -> impl Future<Output = F::Output> {
        TASK_SCOPE.scope(self, future)
    }

    /// Makes this scope current on this thread until the guard drops.
    pub fn enter(&self) -> Entered {
        let previous = THREAD_SCOPE.with(|slot| slot.replace(Some(self.clone())));
        Entered { previous }
    }

    pub(crate) fn add(&self, segment: &Segment) {
        let elapsed_us = segment.elapsed_ns / 1_000;
        let offset_us = (self.0.started.elapsed().as_micros() as u64).saturating_sub(elapsed_us);
        let mut trace = self.0.trace.lock().unwrap();
        trace.segments += 1;
        if !segment.nested {
            count_into(
                trace.kinds.entry(segment.kind).or_default(),
                segment.elapsed_ns,
            );
        }
        trace.counters.add(&segment.counters);
        count_into(
            trace.parts.entry(segment.key).or_default(),
            segment.elapsed_ns,
        );
        if trace.events.len() < EVENTS_KEPT {
            trace.events.push(Event {
                key: segment.key,
                offset_us,
                duration_us: elapsed_us,
                rows: segment.counters.rows,
            });
        } else {
            trace.dropped_events += 1;
        }
    }

    pub(crate) fn run_record(&self, status: Option<u16>, bytes: Option<u64>) -> Run {
        let trace = self.0.trace.lock().unwrap();
        let worst_repeat = trace
            .parts
            .iter()
            .max_by_key(|(_, part)| part.count)
            .map(|(key, part)| Repeat {
                key: *key,
                count: u32::try_from(part.count).unwrap_or(u32::MAX),
            })
            .unwrap_or_default();
        Run {
            elapsed_ns: self.0.started.elapsed().as_nanos() as u64,
            status,
            bytes,
            segments: trace.segments,
            kinds: trace.kinds.clone(),
            worst_repeat,
            parts: trace.parts.clone(),
        }
    }
}

/// Puts the previous scope back when it drops. See [`Scope::enter`].
pub struct Entered {
    previous: Option<Scope>,
}

impl Drop for Entered {
    fn drop(&mut self) {
        let previous = self.previous.take();
        THREAD_SCOPE.with(|slot| *slot.borrow_mut() = previous);
    }
}

/// Wraps `work` so it runs inside the scope current here, wherever it is sent:
/// `tokio::task::spawn_blocking(carry(move || ...))`. Without a current scope
/// it is `work` unchanged.
pub fn carry<R>(work: impl FnOnce() -> R) -> impl FnOnce() -> R {
    let scope = Scope::current();
    move || {
        let _entered = scope.as_ref().map(Scope::enter);
        work()
    }
}

fn count_into(part: &mut Part, nanos: u64) {
    part.count += 1;
    part.total_ns = part.total_ns.saturating_add(nanos);
}

pub(crate) fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn segment(key: u64, ms: u64) -> Segment {
        Segment {
            nested: false,
            kind: "sql",
            key,
            elapsed_ns: ms * 1_000_000,
            counters: Counters {
                rows: 3,
                ..Counters::default()
            },
        }
    }

    #[test]
    fn a_carried_closure_counts_toward_the_scope_on_another_thread() {
        let scope = Scope::new(ScopeKind::Request, "GET /x".into());
        let _entered = scope.enter();

        let work = carry(|| Scope::current().map(|s| s.id()));
        let seen = std::thread::spawn(work).join().unwrap();

        assert_eq!(seen, Some(scope.id()));
    }

    #[test]
    fn leaving_a_scope_restores_the_one_before() {
        let outer = Scope::new(ScopeKind::Job, "scan".into());
        let inner = Scope::new(ScopeKind::Request, "GET /y".into());
        let _outer = outer.enter();

        drop(inner.enter());

        assert_eq!(Scope::current().map(|s| s.id()), Some(outer.id()));
    }

    #[tokio::test]
    async fn a_scope_run_on_a_task_is_current_inside_it() {
        let scope = Scope::new(ScopeKind::Request, "GET /z".into());

        let seen = scope
            .clone()
            .run(async { Scope::current().map(|s| s.id()) })
            .await;

        assert_eq!(seen, Some(scope.id()));
    }

    #[test]
    fn the_run_names_the_segment_repeated_most() {
        let scope = Scope::new(ScopeKind::Request, "GET /shows/{id}".into());
        for _ in 0..217 {
            scope.add(&segment(1, 1));
        }
        scope.add(&segment(2, 30));

        let run = scope.run_record(Some(200), None);

        assert_eq!(run.segments, 218);
        assert_eq!(run.worst_repeat, Repeat { key: 1, count: 217 });
        assert_eq!(run.parts[&2].total_ns, 30_000_000);
    }

    #[test]
    fn the_waterfall_stops_growing_but_the_counts_do_not() {
        let scope = Scope::new(ScopeKind::Job, "embed".into());

        for _ in 0..(EVENTS_KEPT + 10) {
            scope.add(&segment(9, 0));
        }

        let trace = scope.0.trace.lock().unwrap();
        assert_eq!(trace.events.len(), EVENTS_KEPT);
        assert_eq!(trace.dropped_events, 10);
        assert_eq!(trace.segments as usize, EVENTS_KEPT + 10);
    }
}
