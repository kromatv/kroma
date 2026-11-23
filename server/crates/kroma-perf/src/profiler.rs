use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::live::{Live, Running};
use crate::recent::{Bucket, Recent, ScopeKey, HOUR_MS};
use crate::scope::{now_ms, Scope, ScopeKind};
use crate::segment::{Catalog, Counters, Descriptor, Segment};
use crate::slow::{SlowRequest, SlowRing};
use crate::stats::Part;
use crate::store::Store;

const UNATTRIBUTED: &str = "(unattributed)";

static PROFILER: LazyLock<Profiler> = LazyLock::new(Profiler::new);

/// The one profiler of this process. Every SQLite connection, every scope and
/// every measured segment reports to it.
pub fn profiler() -> &'static Profiler {
    &PROFILER
}

/// A stretch of history to report on.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Window {
    #[serde(rename = "1h")]
    Hour,
    #[serde(rename = "24h")]
    Day,
    #[serde(rename = "7d")]
    Week,
    #[serde(rename = "30d")]
    Month,
}

impl Window {
    pub fn as_str(self) -> &'static str {
        match self {
            Window::Hour => "1h",
            Window::Day => "24h",
            Window::Week => "7d",
            Window::Month => "30d",
        }
    }

    pub fn millis(self) -> i64 {
        match self {
            Window::Hour => HOUR_MS,
            Window::Day => 24 * HOUR_MS,
            Window::Week => 7 * 24 * HOUR_MS,
            Window::Month => 30 * 24 * HOUR_MS,
        }
    }
}

/// A timing measured outside this process, as [`Profiler::record_reported`]
/// files it.
#[derive(Clone, Copy, Debug)]
pub struct Reported<'a> {
    pub kind: &'static str,
    pub label: &'a str,
    pub origin: Option<&'a str>,
    pub caller: &'a str,
    pub elapsed: Duration,
}

/// What a finished scope cost, for a `Server-Timing` header.
#[derive(Clone, Debug, PartialEq)]
pub struct Finished {
    pub name: String,
    pub total: Duration,
    pub kinds: BTreeMap<&'static str, Part>,
}

impl Finished {
    /// The `Server-Timing` header value: the whole run, then the time and count
    /// of each kind of segment in it. Kinds overlap (a span holds the SQL it
    /// ran), so they are never summed.
    pub fn server_timing(&self) -> String {
        let name = self.name.replace(['"', '\\'], "");
        let mut entries = vec![
            format!("total;dur={:.1}", self.total.as_secs_f64() * 1_000.0),
            format!("scope;desc=\"{name}\""),
        ];
        for (kind, part) in &self.kinds {
            let ms = part.total_ns as f64 / 1_000_000.0;
            entries.push(format!("{kind};dur={ms:.1};desc=\"{} {kind}\"", part.count));
        }
        entries.join(", ")
    }
}

pub struct Profiler {
    enabled: AtomicBool,
    pub(crate) catalog: Catalog,
    recent: Mutex<Recent>,
    slow: Mutex<SlowRing>,
    live: Live,
    store: OnceLock<Store>,
}

impl Profiler {
    #[cfg(test)]
    pub(crate) fn new_for_tests() -> Profiler {
        Profiler::new()
    }

    fn new() -> Profiler {
        Profiler {
            enabled: AtomicBool::new(true),
            catalog: Catalog::default(),
            recent: Mutex::new(Recent::new(now_ms())),
            slow: Mutex::new(SlowRing::default()),
            live: Live::default(),
            store: OnceLock::new(),
        }
    }

    pub fn enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }

    /// Turns measuring on or off for the whole process. Off, a scope is never
    /// opened and a statement costs one atomic load.
    pub fn set_enabled(&self, on: bool) {
        self.enabled.store(on, Ordering::Relaxed);
    }

    /// Opens a scope for one request, named by its route rather than its URL so
    /// every call of a route lands in one entry. `None` while switched off.
    pub fn request(&self, method: &str, route: &str) -> Option<Scope> {
        self.open(ScopeKind::Request, format!("{method} {route}"))
    }

    /// Opens a scope for one run of a background job. `None` while switched off.
    pub fn job(&self, name: &str) -> Option<Scope> {
        self.open(ScopeKind::Job, name.to_string())
    }

    fn open(&self, kind: ScopeKind, name: String) -> Option<Scope> {
        if !self.enabled() {
            return None;
        }
        let scope = Scope::new(kind, name);
        self.live.add(&scope);
        Some(scope)
    }

    /// Closes `scope`: its run joins its route's or job's history, and a slow
    /// request keeps its waterfall.
    pub fn finish(&self, scope: &Scope, status: Option<u16>, bytes: Option<u64>) -> Finished {
        self.live.remove(scope.id());
        let run = scope.run_record(status, bytes);
        let key = ScopeKey {
            kind: scope.0.kind,
            name: scope.name().to_string(),
        };
        self.recent.lock().unwrap().record_scope(key, &run);
        if scope.0.kind == ScopeKind::Request && SlowRequest::worth_keeping(&run) {
            self.keep_slow(SlowRequest::of(scope, &run));
        }
        Finished {
            name: scope.name().to_string(),
            total: Duration::from_nanos(run.elapsed_ns),
            kinds: run.kinds,
        }
    }

    fn keep_slow(&self, request: SlowRequest) {
        if let Some(store) = self.store.get() {
            store.keep_slow(request.clone());
        }
        self.slow.lock().unwrap().push(request);
    }

    /// Records one measured segment: in the scope current here, and in the
    /// history of its key.
    pub fn record(&self, kind: &'static str, label: &str, origin: Option<&str>, elapsed: Duration) {
        self.record_segment(kind, (label, origin), elapsed, false);
    }

    pub(crate) fn record_segment(
        &self,
        kind: &'static str,
        (label, origin): (&str, Option<&str>),
        elapsed: Duration,
        nested: bool,
    ) {
        if !self.enabled() {
            return;
        }
        let key = self.catalog.key_for(kind, label, origin);
        let nanos = u64::try_from(elapsed.as_nanos()).unwrap_or(u64::MAX);
        self.add(Segment {
            kind,
            key,
            elapsed_ns: nanos,
            counters: Counters::default(),
            nested,
        });
    }

    pub(crate) fn add(&self, segment: Segment) {
        let scope = Scope::current();
        if let Some(scope) = &scope {
            scope.add(&segment);
        }
        let caller = scope.as_ref().map_or(UNATTRIBUTED, Scope::name);
        self.keep_segment(&segment, caller);
    }

    /// Records a segment that belongs to no scope of this process: a timing a
    /// client measured on its side and reported, filed under `caller`.
    pub fn record_reported(&self, reported: Reported<'_>) {
        if !self.enabled() {
            return;
        }
        let key = self
            .catalog
            .key_for(reported.kind, reported.label, reported.origin);
        let nanos = u64::try_from(reported.elapsed.as_nanos()).unwrap_or(u64::MAX);
        let segment = Segment {
            kind: reported.kind,
            key,
            elapsed_ns: nanos,
            counters: Counters::default(),
            nested: false,
        };
        self.keep_segment(&segment, reported.caller);
    }

    fn keep_segment(&self, segment: &Segment, caller: &str) {
        let mut recent = self.recent.lock().unwrap();
        recent.record_segment(segment.key, segment.elapsed_ns, &segment.counters, caller);
    }

    /// Closes the five-minute bucket once it is over and hands what changed to
    /// the store. Called on a timer, so an idle server still rolls over.
    pub fn tick(&self) {
        let changed = self.recent.lock().unwrap().rotate(now_ms());
        let Some(store) = self.store.get() else {
            return;
        };
        if !changed.is_empty() {
            store.keep_catalog(self.catalog.all());
        }
        for hour in changed {
            store.keep_hour(hour);
        }
    }

    /// Keeps history in `store` from now on, and learns the names of the keys
    /// it already holds. A second call is ignored.
    pub fn attach(&self, store: Store) {
        for (key, descriptor) in store.catalog() {
            self.catalog.adopt(key, descriptor);
        }
        let _ = self.store.set(store);
    }

    /// Everything measured over `window`, merged into one bucket. Past the last
    /// hour it reads the store, and falls back to memory without one.
    pub fn window(&self, window: Window) -> Bucket {
        let now = now_ms();
        if window == Window::Hour {
            return self.recent.lock().unwrap().last_hour(now);
        }
        let Some(store) = self.store.get() else {
            return self.recent.lock().unwrap().unstored(true);
        };
        let mut merged = store
            .read_since(now - window.millis())
            .unwrap_or_else(|error| {
                tracing::warn!(%error, "performance history did not read");
                Bucket::default()
            });
        merged.merge(&self.recent.lock().unwrap().unstored(false));
        merged
    }

    pub(crate) fn slow(&self) -> Vec<SlowRequest> {
        self.slow.lock().unwrap().list()
    }

    /// One slow request by id, from memory or, once it has rolled out of it,
    /// from the store.
    pub(crate) fn slow_request(&self, id: u64) -> Option<SlowRequest> {
        self.slow
            .lock()
            .unwrap()
            .find(id)
            .or_else(|| self.store.get().and_then(|store| store.slow_request(id)))
    }

    pub(crate) fn store_slow_since(&self, since_ms: i64) -> Vec<SlowRequest> {
        self.store
            .get()
            .and_then(|store| store.slow_since(since_ms).ok())
            .unwrap_or_default()
    }

    pub(crate) fn live(&self) -> Vec<Running> {
        self.live.list()
    }

    pub fn describe(&self, key: u64) -> Option<Descriptor> {
        self.catalog.describe(key)
    }
}

#[cfg(test)]
mod tests;
