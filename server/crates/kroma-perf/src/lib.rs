//! Measures what a process spends its time on, and attributes every piece of it
//! to the request or job that ran it.
//!
//! - A [`Scope`] is one request or one job run. The HTTP layer opens one per
//!   request with [`Profiler::request`]; a job runner wraps each run in [`job`].
//!   Work sent to another thread stays in it through [`carry`].
//! - A segment is one timed piece of work inside a scope: every SQLite
//!   statement once [`install`] has run, every span of [`span_layer`], and
//!   anything handed to [`record`].
//! - History is kept in five-minute buckets for the last hour and, once a
//!   [`Store`] is attached, by hour then by day for a month, along with the
//!   waterfall of every slow request.
//!
//! Nothing here names the application it measures.

mod export;
mod flags;
mod histogram;
mod hook;
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

pub use hook::{install, name_databases, DatabaseNamer};
pub use profiler::{profiler, Finished, Profiler, Window};
pub use report::{Flag, KindRow, Named, Overview, PartRow, RepeatRow, ScopeRow, SegmentRow};
pub use scope::{carry, Entered, Event, Scope, ScopeKind};
pub use segment::{Descriptor, Measured};
pub use slow::SlowRequest;
pub use span_layer::span_layer;
pub use store::Store;
pub use views::{KindTotal, SlowReport, WaterfallStep};

/// Records a piece of work its caller timed, in the scope current here.
pub fn record(measured: Measured<'_>) {
    profiler().record(measured);
}

/// Runs `work` as one run of the job `name`: everything it does on this thread,
/// or on a thread it [`carry`]s the scope to, counts toward the run.
pub fn job<R>(name: &str, work: impl FnOnce() -> R) -> R {
    let Some(scope) = profiler().job(name) else {
        return work();
    };
    let result = {
        let _entered = scope.enter();
        work()
    };
    profiler().finish(&scope, None, None);
    result
}
