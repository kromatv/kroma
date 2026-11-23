//! Measures what a process spends its time on, and attributes every piece of it
//! to the request or job that ran it.
//!
//! - A [`Scope`] is one request or one job run. The HTTP layer opens one per
//!   request with [`Profiler::request`]; a job runner with [`Profiler::job`].
//!   Work sent to another thread stays in it through [`carry`].
//! - A segment is one timed piece of work inside a scope: every SQLite
//!   statement once [`install`] has run, every span of [`span_layer`], and
//!   anything wrapped in [`measure`].
//! - History is kept in five-minute buckets for the last hour and, once a
//!   [`Store`] is attached, by hour then by day for a month, along with the
//!   waterfall of every slow request.
//!
//! Nothing here names the application it measures.

mod export;
mod flags;
mod histogram;
mod hook;
mod live;
mod profiler;
mod recent;
mod report;
mod scope;
mod segment;
mod slow;
mod span_layer;
mod sql_text;
mod stats;
mod store;
mod views;

use std::future::Future;
use std::time::{Duration, Instant};

pub use export::Format;
pub use hook::{install, name_databases, DatabaseNamer};
pub use profiler::{profiler, Finished, Profiler, Reported, Window};
pub use report::{Flag, KindRow, Named, Overview, PartRow, RepeatRow, ScopeRow, SegmentRow};
pub use scope::{carry, Entered, Event, Scope, ScopeKind};
pub use segment::Descriptor;
pub use slow::SlowRequest;
pub use span_layer::span_layer;
pub use store::Store;
pub use views::{KindTotal, LiveRow, SlowReport, WaterfallStep};

/// Times `work` as one segment of `kind` (`"http"`, `"fs"`, ...) named `label`,
/// counted in the scope current here. `origin` is where it ran: a host, a path.
pub fn measure<R>(
    kind: &'static str,
    label: &str,
    origin: Option<&str>,
    work: impl FnOnce() -> R,
) -> R {
    let started = Instant::now();
    let result = work();
    profiler().record(kind, label, origin, started.elapsed());
    result
}

/// [`measure`] for a future: the time from the first poll to the result.
pub async fn measure_async<F: Future>(
    kind: &'static str,
    label: &str,
    origin: Option<&str>,
    work: F,
) -> F::Output {
    let started = Instant::now();
    let result = work.await;
    profiler().record(kind, label, origin, started.elapsed());
    result
}

/// Records a segment measured elsewhere.
pub fn record(kind: &'static str, label: &str, origin: Option<&str>, elapsed: Duration) {
    profiler().record(kind, label, origin, elapsed);
}
