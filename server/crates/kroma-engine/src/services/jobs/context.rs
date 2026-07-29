//! The per-run handle (live state behind the registry) and the [`JobContext`]
//! handed to a running job its only interface to the outside world: structured
//! logging, progress reporting and cooperative cancellation.

use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;

use crate::db;
use crate::infra::events::ServerEvent;
use crate::state::SharedState;

use super::now_ms;

/// Live state of an in-flight run, kept in the manager's `running` map so the
/// admin API can report progress and request cancellation without touching the
/// DB. Atomics so the job thread and HTTP handlers don't contend on a lock.
pub struct RunHandle {
    pub run_id: String,
    pub key: String,
    pub(super) cancel: AtomicBool,
    pub(super) done: AtomicI64,
    pub(super) total: AtomicI64,
    /// Throttle stamp for the DB/WS progress writes (epoch ms of the last flush).
    last_flush_ms: AtomicI64,
}

impl RunHandle {
    pub fn new(run_id: String, key: String) -> Self {
        Self {
            run_id,
            key,
            cancel: AtomicBool::new(false),
            done: AtomicI64::new(0),
            total: AtomicI64::new(0),
            last_flush_ms: AtomicI64::new(0),
        }
    }

    /// Request cooperative cancellation; the job observes it via
    /// [`JobContext::cancelled`].
    pub fn request_cancel(&self) {
        self.cancel.store(true, Ordering::Relaxed);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::Relaxed)
    }

    /// Current progress `(done, total)` `total == 0` means "indeterminate".
    pub fn progress(&self) -> (i64, i64) {
        (self.done.load(Ordering::Relaxed), self.total.load(Ordering::Relaxed))
    }
}

/// The handle a job body uses to talk to the system. Cheap to pass by reference.
pub struct JobContext {
    pub state: SharedState,
    handle: Arc<RunHandle>,
}

impl JobContext {
    pub(super) fn new(state: SharedState, handle: Arc<RunHandle>) -> Self {
        Self { state, handle }
    }

    /// Test-only: build a context around a caller-owned run handle so
    /// `&SharedState`-dependent services (the pipeline dispatcher) can be
    /// exercised without going through [`super::JobManager::trigger`]. Keeping the
    /// handle lets a test drive cancellation (`handle.request_cancel()`).
    #[cfg(test)]
    pub(crate) fn from_handle(state: SharedState, handle: Arc<RunHandle>) -> Self {
        Self { state, handle }
    }

    /// Test-only convenience: a context wrapping a fresh, non-cancelled handle.
    #[cfg(test)]
    pub(crate) fn for_test(state: SharedState) -> Self {
        Self::from_handle(state, Arc::new(RunHandle::new("test-run".into(), "test.job".into())))
    }

    /// Whether an admin has requested cancellation. Long jobs should poll this
    /// between units of work and return early (returning `Ok(())` → the run is
    /// recorded as `cancelled`).
    pub fn cancelled(&self) -> bool {
        self.handle.is_cancelled()
    }

    /// Report progress. `total == 0` renders as an indeterminate/among-N bar.
    /// DB + WS writes are throttled to ~1/s; the in-memory value updates every
    /// call so the API always sees the latest.
    pub fn progress(&self, done: usize, total: usize) {
        self.handle.done.store(done as i64, Ordering::Relaxed);
        self.handle.total.store(total as i64, Ordering::Relaxed);
        let now = now_ms();
        let last = self.handle.last_flush_ms.load(Ordering::Relaxed);
        // Always flush the terminal (done == total) update; otherwise rate-limit.
        let terminal = total > 0 && done >= total;
        if !terminal && now - last < 1000 {
            return;
        }
        self.handle.last_flush_ms.store(now, Ordering::Relaxed);
        let pool = self.state.db.clone();
        let (rid, d, t) = (self.handle.run_id.clone(), done as i64, total as i64);
        let _ = db::update_job_run_progress(&pool, &rid, d, t);
        self.state.events.publish(ServerEvent::JobProgress {
            key: self.handle.key.clone(),
            run_id: self.handle.run_id.clone(),
            done,
            total,
        });
    }

    /// Append a log line (persisted, streamed over the WS bus, and mirrored to
    /// the server's own tracing log). `level` is `"debug" | "info" | "warn" |
    /// "error"`. All levels persist so the admin Tâches run view can show the
    /// full story (debug reasoning, warnings, and errors), not just `info`.
    pub fn log(&self, level: &'static str, message: impl Into<String>) {
        let message = message.into();
        let ts = now_ms();
        let pool = self.state.db.clone();
        let _ = db::insert_job_log(&pool, &self.handle.run_id, ts, level, &message);
        match level {
            "error" => tracing::error!(job = %self.handle.key, run = %self.handle.run_id, "{message}"),
            "warn" => tracing::warn!(job = %self.handle.key, run = %self.handle.run_id, "{message}"),
            "debug" => tracing::debug!(job = %self.handle.key, run = %self.handle.run_id, "{message}"),
            _ => tracing::info!(job = %self.handle.key, run = %self.handle.run_id, "{message}"),
        }
        self.state.events.publish(ServerEvent::JobLog {
            run_id: self.handle.run_id.clone(),
            level,
            message,
        });
    }

    /// Verbose detail for diagnosing a run (skip reasons, request/response sizes,
    /// per-item outcomes). Persisted + shown in the Tâches log, tagged `debug`.
    pub fn debug(&self, message: impl Into<String>) {
        self.log("debug", message);
    }

    /// An owned `debug`-level logger that outlives a borrow of `self` for
    /// helpers run within the job that log on their own (e.g. the LLM connector's
    /// per-tool-call lines). Captures cloned handles, so it writes to this same
    /// run exactly like [`debug`](Self::debug).
    pub fn debug_logger(&self) -> Box<dyn Fn(String) + Send + Sync> {
        let pool = self.state.db.clone();
        let events = self.state.events.clone();
        let run_id = self.handle.run_id.clone();
        Box::new(move |message: String| {
            let ts = now_ms();
            let _ = db::insert_job_log(&pool, &run_id, ts, "debug", &message);
            tracing::debug!(run = %run_id, "{message}");
            events.publish(ServerEvent::JobLog { run_id: run_id.clone(), level: "debug", message });
        })
    }

    pub fn info(&self, message: impl Into<String>) {
        self.log("info", message);
    }

    pub fn warn(&self, message: impl Into<String>) {
        self.log("warn", message);
    }

    /// A genuine failure within the run (an LLM call errored, a reply wouldn't
    /// parse). The run can still complete; this surfaces *why* something was
    /// skipped instead of swallowing it.
    pub fn error(&self, message: impl Into<String>) {
        self.log("error", message);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::test_state;

    /// Every bus message published so far, as JSON.
    fn drain(
        rx: &mut tokio::sync::broadcast::Receiver<crate::infra::events::Envelope>,
    ) -> Vec<serde_json::Value> {
        let mut out = Vec::new();
        while let Ok(env) = rx.try_recv() {
            out.push(serde_json::from_str(env.payload_unrouted()).unwrap());
        }
        out
    }

    fn ctx() -> (crate::state::SharedState, Arc<RunHandle>, JobContext) {
        let state = test_state();
        let handle = Arc::new(RunHandle::new("run-1".into(), "test.job".into()));
        let ctx = JobContext::from_handle(state.clone(), handle.clone());
        (state, handle, ctx)
    }

    #[test]
    fn reports_cancellation_the_admin_requested() {
        let (_state, handle, ctx) = ctx();
        assert!(!ctx.cancelled(), "a fresh run is not cancelled");
        handle.request_cancel();
        // Long jobs poll this between units of work; if it never flipped, the
        // Cancel button in the console would do nothing.
        assert!(ctx.cancelled());
    }

    #[test]
    fn updates_the_in_memory_progress_on_every_call() {
        let (_state, handle, ctx) = ctx();
        ctx.progress(1, 100);
        ctx.progress(2, 100);
        ctx.progress(3, 100);
        // The DB/WS writes are throttled, but the value the API reads is not -
        // otherwise `GET /api/jobs` would show a figure up to a second stale.
        assert_eq!(handle.progress(), (3, 100));
    }

    #[test]
    fn throttles_the_broadcast_but_never_the_final_update() {
        let (state, _handle, ctx) = ctx();
        let mut rx = state.events.subscribe();

        // A tight loop of mid-run updates: at most one gets out per second, so a
        // fast job cannot flood every connected client.
        for i in 1..50 {
            ctx.progress(i, 100);
        }
        let mid = drain(&mut rx).len();
        assert!(mid <= 2, "expected at most one throttled flush, saw {mid}");

        // The terminal update always flushes, or the bar finishes at 49/100 and
        // sits there.
        ctx.progress(100, 100);
        let last = drain(&mut rx);
        assert_eq!(last.len(), 1);
        assert_eq!(last[0]["type"], "job.progress");
        assert_eq!(last[0]["done"], 100);
        assert_eq!(last[0]["total"], 100);
        assert_eq!(last[0]["runId"], "run-1");
    }

    #[test]
    fn an_indeterminate_total_is_not_treated_as_terminal() {
        let (state, _handle, ctx) = ctx();
        let mut rx = state.events.subscribe();
        // `total == 0` renders as an indeterminate bar. `done >= total` would be
        // true for every such call, defeating the throttle entirely.
        for i in 1..50 {
            ctx.progress(i, 0);
        }
        assert!(drain(&mut rx).len() <= 2);
    }

    #[test]
    fn logs_carry_their_level_to_the_console() {
        let (state, _handle, ctx) = ctx();
        let mut rx = state.events.subscribe();

        ctx.debug("d");
        ctx.info("i");
        ctx.warn("w");
        ctx.error("e");

        let seen: Vec<(String, String)> = drain(&mut rx)
            .iter()
            .map(|v| (v["level"].as_str().unwrap().into(), v["message"].as_str().unwrap().into()))
            .collect();
        // ALL levels reach the run view, not just info: the Tâches log is meant
        // to show the full story, including why something was skipped.
        assert_eq!(
            seen,
            vec![
                ("debug".to_string(), "d".to_string()),
                ("info".into(), "i".into()),
                ("warn".into(), "w".into()),
                ("error".into(), "e".into()),
            ]
        );
    }

    #[test]
    fn a_log_line_is_addressed_to_its_own_run() {
        let (state, _handle, ctx) = ctx();
        let mut rx = state.events.subscribe();
        ctx.info("hello");

        let events = drain(&mut rx);
        assert_eq!(events[0]["type"], "job.log");
        // The console filters by run id; without it a line lands under whichever
        // run the user happens to have open.
        assert_eq!(events[0]["runId"], "run-1");
    }

    #[test]
    fn the_owned_logger_writes_to_the_same_run() {
        let (state, _handle, ctx) = ctx();
        let mut rx = state.events.subscribe();

        // Handed to helpers that outlive a borrow of the context (the LLM
        // connector's per-tool-call lines).
        let logger = ctx.debug_logger();
        drop(ctx);
        logger("from a helper".into());

        let events = drain(&mut rx);
        assert_eq!(events[0]["runId"], "run-1");
        assert_eq!(events[0]["level"], "debug");
        assert_eq!(events[0]["message"], "from a helper");
    }
}
