//! The per-run handle and the [`JobContext`] handed to a running job: logging,
//! progress reporting and cooperative cancellation.

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

    /// Cancellation is cooperative: the job observes it via
    /// [`JobContext::cancelled`].
    pub fn request_cancel(&self) {
        self.cancel.store(true, Ordering::Relaxed);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::Relaxed)
    }

    /// `total == 0` means "indeterminate".
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

    #[cfg(test)]
    pub(crate) fn from_handle(state: SharedState, handle: Arc<RunHandle>) -> Self {
        Self { state, handle }
    }

    #[cfg(test)]
    pub(crate) fn for_test(state: SharedState) -> Self {
        Self::from_handle(state, Arc::new(RunHandle::new("test-run".into(), "test.job".into())))
    }

    /// Long jobs should poll this between units of work and return early;
    /// returning `Ok(())` records the run as `cancelled`.
    pub fn cancelled(&self) -> bool {
        self.handle.is_cancelled()
    }

    /// `total == 0` renders as an indeterminate bar. DB + WS writes are
    /// throttled to ~1/s; the in-memory value updates on every call.
    pub fn progress(&self, done: usize, total: usize) {
        self.handle.done.store(done as i64, Ordering::Relaxed);
        self.handle.total.store(total as i64, Ordering::Relaxed);
        let now = now_ms();
        let last = self.handle.last_flush_ms.load(Ordering::Relaxed);
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
    /// tracing). `level` is `"debug" | "info" | "warn" | "error"`; all of them
    /// persist, so the admin run view shows the full story and not just `info`.
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

    pub fn debug(&self, message: impl Into<String>) {
        self.log("debug", message);
    }

    /// An owned `debug`-level logger for helpers that outlive a borrow of
    /// `self`; it writes to this same run, exactly like [`debug`](Self::debug).
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

    /// A failure within a run that can still complete.
    pub fn error(&self, message: impl Into<String>) {
        self.log("error", message);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::test_state;

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
        assert!(ctx.cancelled());
    }

    #[test]
    fn updates_the_in_memory_progress_on_every_call() {
        let (_state, handle, ctx) = ctx();
        ctx.progress(1, 100);
        ctx.progress(2, 100);
        ctx.progress(3, 100);
        assert_eq!(handle.progress(), (3, 100));
    }

    #[test]
    fn throttles_the_broadcast_but_never_the_final_update() {
        let (state, _handle, ctx) = ctx();
        let mut rx = state.events.subscribe();

        for i in 1..50 {
            ctx.progress(i, 100);
        }
        let mid = drain(&mut rx).len();
        assert!(mid <= 2, "expected at most one throttled flush, saw {mid}");

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
        // A bare `done >= total` would be true for every such call, defeating
        // the throttle entirely.
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
        assert_eq!(events[0]["runId"], "run-1");
    }

    #[test]
    fn the_owned_logger_writes_to_the_same_run() {
        let (state, _handle, ctx) = ctx();
        let mut rx = state.events.subscribe();

        let logger = ctx.debug_logger();
        drop(ctx);
        logger("from a helper".into());

        let events = drain(&mut rx);
        assert_eq!(events[0]["runId"], "run-1");
        assert_eq!(events[0]["level"], "debug");
        assert_eq!(events[0]["message"], "from a helper");
    }
}
