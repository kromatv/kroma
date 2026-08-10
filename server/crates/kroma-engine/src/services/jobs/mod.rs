//! Background job system: a scheduler + registry that runs named units of work on
//! a cron schedule or on demand, with every run tracked (status, progress, logs,
//! errors) in SQLite. Handlers and their [`Builtin`] specs live in [`builtins`].

mod builtins;
mod context;
mod cron;
mod scheduler;
mod views;

pub use builtins::{register_all, Builtin};
pub use context::{JobContext, RunHandle};
pub use cron::Cron;

use std::collections::HashMap;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

use anyhow::{anyhow, Result};
use time::OffsetDateTime;
use tracing::{info, warn};

use crate::db;
use crate::infra::events::ServerEvent;
use crate::model::Category;
use crate::state::SharedState;

/// The run logic of a remote (out-of-process module) job, injected from
/// `server/src`: `kroma-engine` must not depend on the sidecar supervisor, so it
/// only ever sees this boxed closure.
pub type RemoteRun = Arc<dyn Fn(&JobContext) -> anyhow::Result<()> + Send + Sync>;

struct RemoteJob {
    key: JobKey,
    category: Category,
    schedule: Option<String>,
    run: RemoteRun,
}

enum Runner {
    Local(fn(&JobContext) -> anyhow::Result<()>),
    Remote(RemoteRun),
}

/// A job's stable dotted key (`"cache.cleanup"`), which is also the DB key, the
/// `/api/admin/jobs/:key` URL segment and the i18n base (`jobs.{key}.name`). It
/// `Borrow`s as `str`, so a raw request key indexes the keyed maps directly.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct JobKey(pub &'static str);

impl JobKey {
    pub fn as_str(self) -> &'static str {
        self.0
    }
}

impl std::borrow::Borrow<str> for JobKey {
    fn borrow(&self) -> &str {
        self.0
    }
}

impl std::fmt::Display for JobKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.0)
    }
}

const RUNS_KEPT: usize = 50;

pub use kroma_primitives::now_ms;

// "Now" shifted into the configured scheduler timezone, so cron `0 4 * * *` means
// 4am local.
fn now_local(state: &SharedState) -> OffsetDateTime {
    let mins = state.settings.get_i64("jobsUtcOffset", 0);
    let offset = time::UtcOffset::from_whole_seconds((mins * 60) as i32)
        .unwrap_or(time::UtcOffset::UTC);
    OffsetDateTime::now_utc().to_offset(offset)
}

/// A trigger source a job opts into, on top of manual runs + its cron schedule.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Trigger {
    LibraryChange,
    AfterJob(JobKey),
}

/// Why a [`JobManager::trigger`] failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TriggerError {
    Unknown,
    AlreadyRunning,
}

#[derive(Clone)]
struct ScheduleState {
    schedule: Option<String>,
    enabled: bool,
    customized: bool,
}

/// The job registry + live run state. Built once at startup and shared behind an `Arc`.
pub struct JobManager {
    order: Vec<JobKey>,
    jobs: HashMap<JobKey, &'static Builtin>,
    // Interior-mutable because a sidecar registers (and re-registers on every
    // respawn) long after startup, unlike the `'static` built-in `jobs` map.
    remote: RwLock<HashMap<&'static str, RemoteJob>>,
    remote_order: RwLock<Vec<JobKey>>,
    schedules: RwLock<HashMap<JobKey, ScheduleState>>,
    running: RwLock<HashMap<JobKey, Arc<RunHandle>>>,
    counter: AtomicU64,
    // Global "hold all pipeline stages" switch, separate from the per-stage
    // playback pause. Seeded from the persisted `pipelinePaused` setting at boot.
    pipeline_paused: AtomicBool,
}

impl JobManager {
    pub fn new() -> Self {
        Self {
            order: Vec::new(),
            jobs: HashMap::new(),
            remote: RwLock::new(HashMap::new()),
            remote_order: RwLock::new(Vec::new()),
            schedules: RwLock::new(HashMap::new()),
            running: RwLock::new(HashMap::new()),
            counter: AtomicU64::new(0),
            pipeline_paused: AtomicBool::new(false),
        }
    }

    /// Takes effect within a poll tick of the dispatcher, not immediately.
    pub fn set_pipeline_paused(&self, paused: bool) {
        self.pipeline_paused.store(paused, Ordering::Relaxed);
    }

    pub fn pipeline_paused(&self) -> bool {
        self.pipeline_paused.load(Ordering::Relaxed)
    }

    /// Call during startup only, before wrapping in `Arc`.
    pub fn register(&mut self, b: &'static Builtin) {
        self.schedules.write().unwrap().insert(
            b.key,
            ScheduleState {
                schedule: b.schedule.map(str::to_string),
                enabled: true,
                customized: false,
            },
        );
        self.order.push(b.key);
        self.jobs.insert(b.key, b);
    }

    /// Register (or re-register) a job contributed by an out-of-process module.
    /// `key` must be a `&'static str` leaked once per module+key, so respawns reuse
    /// it. The schedule seeds a [`ScheduleState`] only when the key is new (a
    /// persisted or admin override must survive re-registration); `run` is always
    /// refreshed.
    pub fn register_remote(
        &self,
        key: &'static str,
        category: Category,
        schedule: Option<String>,
        run: RemoteRun,
    ) {
        let job = JobKey(key);
        self.schedules.write().unwrap().entry(job).or_insert_with(|| ScheduleState {
            schedule: schedule.clone(),
            enabled: true,
            customized: false,
        });
        {
            let mut order = self.remote_order.write().unwrap();
            if !order.contains(&job) {
                order.push(job);
            }
        }
        self.remote.write().unwrap().insert(key, RemoteJob { key: job, category, schedule, run });
    }

    /// The registered identity for a request/stored key string, or `None` if no
    /// such job exists (stale rows / bad URLs are simply ignored).
    pub fn resolve(&self, key: &str) -> Option<JobKey> {
        if let Some(b) = self.jobs.get(key) {
            return Some(b.key);
        }
        self.remote.read().unwrap().get(key).map(|r| r.key)
    }

    /// Overlay persisted schedule overrides from the DB onto the defaults.
    pub fn load_schedules(&self, pool: &db::Pool) {
        let rows = match db::list_job_schedules(pool) {
            Ok(r) => r,
            Err(e) => {
                warn!(error = %e, "failed to load job schedules");
                return;
            }
        };
        let mut map = self.schedules.write().unwrap();
        for (key, schedule, enabled) in rows {
            // Ignore rows for jobs that no longer exist.
            if let Some(st) = map.get_mut(key.as_str()) {
                st.schedule = schedule;
                st.enabled = enabled;
                st.customized = true;
            }
        }
    }

    /// Trigger a job now (manual or scheduled). Returns the new run id.
    pub fn trigger(
        self: &Arc<Self>,
        state: SharedState,
        job: JobKey,
        trigger: &'static str,
    ) -> std::result::Result<String, TriggerError> {
        let runner = if let Some(b) = self.jobs.get(&job) {
            Runner::Local(b.run)
        } else if let Some(r) = self.remote.read().unwrap().get(job.as_str()) {
            Runner::Remote(r.run.clone())
        } else {
            return Err(TriggerError::Unknown);
        };
        let key = job.as_str();

        // One run per key. Reserve the slot under the lock to avoid a race.
        let started_ms = now_ms();
        let n = self.counter.fetch_add(1, Ordering::Relaxed);
        let run_id = format!("{}-{started_ms}-{n}", key.replace('.', "_"));
        let handle = Arc::new(RunHandle::new(run_id.clone(), key.to_string()));
        {
            let mut running = self.running.write().unwrap();
            if running.contains_key(&job) {
                return Err(TriggerError::AlreadyRunning);
            }
            running.insert(job, handle.clone());
        }

        // Announce before the DB insert (on the worker thread below) so the UI
        // flips to "running" without waiting on it.
        state.events.publish(ServerEvent::JobStarted {
            key: key.to_string(),
            run_id: run_id.clone(),
        });

        let manager = self.clone();
        let returned_id = run_id.clone();
        tokio::task::spawn_blocking(move || {
            run_job(manager, state, runner, handle, run_id, key, trigger, job, started_ms)
        });

        Ok(returned_id)
    }

    /// Requests cancellation of every running job; each observes its flag at the
    /// next poll tick, so poll [`running_count`](Self::running_count) for the drain.
    pub fn cancel_all(&self) {
        for handle in self.running.read().unwrap().values() {
            handle.request_cancel();
        }
    }

    pub fn running_count(&self) -> usize {
        self.running.read().unwrap().len()
    }

    /// Returns false if the job is not running.
    pub fn cancel(&self, job: JobKey) -> bool {
        if let Some(handle) = self.running.read().unwrap().get(&job) {
            handle.request_cancel();
            true
        } else {
            false
        }
    }

    /// Persists the override. `schedule = Some(None)` clears it (manual-only).
    pub fn update_schedule(
        &self,
        pool: &db::Pool,
        job: JobKey,
        schedule: Option<Option<String>>,
        enabled: Option<bool>,
    ) -> Result<()> {
        let mut map = self.schedules.write().unwrap();
        let st = map.get_mut(&job).ok_or_else(|| anyhow!("unknown job"))?;
        if let Some(new_schedule) = schedule {
            if let Some(expr) = &new_schedule {
                if !Cron::is_valid(expr) {
                    return Err(anyhow!("invalid cron expression"));
                }
            }
            st.schedule = new_schedule;
        }
        if let Some(en) = enabled {
            st.enabled = en;
        }
        st.customized = true;
        db::upsert_job_schedule(pool, job.as_str(), st.schedule.as_deref(), st.enabled)?;
        Ok(())
    }

    /// Enabled jobs that opted into trigger source `t`, in registration order.
    /// Disabled jobs are skipped, so turning a job off stops its watch/chain runs
    /// too — only a manual "Run now" (straight to `trigger`) still fires.
    pub fn jobs_for_trigger(&self, t: Trigger) -> Vec<JobKey> {
        let schedules = self.schedules.read().unwrap();
        self.order
            .iter()
            .copied()
            .filter(|job| self.jobs.get(job).is_some_and(|b| b.triggers.contains(&t)))
            .filter(|job| schedules.get(job).is_none_or(|s| s.enabled))
            .collect()
    }
}

impl Default for JobManager {
    fn default() -> Self {
        Self::new()
    }
}

#[allow(clippy::too_many_arguments)]
fn run_job(
    manager: Arc<JobManager>,
    state: SharedState,
    runner: Runner,
    handle: Arc<RunHandle>,
    run_id: String,
    key: &'static str,
    trigger: &'static str,
    job: JobKey,
    started_ms: i64,
) {
    let pool = state.db.clone();
    // The run still executes if this fails, but the later UPDATEs no-op against a
    // missing row and it leaves no trace, so surface it rather than swallowing.
    if let Err(e) = db::insert_job_run(&pool, &run_id, key, trigger, started_ms) {
        warn!(job = key, run = %run_id, error = %e, "failed to record job run start");
    }
    info!(job = key, run = %run_id, trigger, "job started");

    let ctx = JobContext::new(state.clone(), handle.clone());
    let result = catch_unwind(AssertUnwindSafe(|| match &runner {
        Runner::Local(f) => f(&ctx),
        Runner::Remote(f) => f(&ctx),
    }));

    let finished_ms = now_ms();
    let (status, error) = classify_result(result, &handle);

    // Mirror a terminal failure into the run's own log stream, not only the
    // `error` column, so the log view explains a panic or an early `?` that
    // logged nothing itself.
    if let ("failed", Some(msg)) = (status, error.as_deref()) {
        let _ = db::insert_job_log(&pool, &run_id, finished_ms, "error", msg);
        state.events.publish(ServerEvent::JobLog {
            run_id: run_id.clone(),
            level: "error",
            message: msg.to_string(),
        });
    }

    if !finalize_run(&pool, &run_id, key, status, finished_ms, error.as_deref()) {
        warn!(job = key, run = %run_id, "gave up recording job finish; run may show as running until restart");
    }
    let _ = db::prune_job_runs(&pool, key, RUNS_KEPT);
    manager.running.write().unwrap().remove(&job);

    match status {
        "failed" => warn!(job = key, run = %run_id, error = error.as_deref().unwrap_or(""), "job failed"),
        other => info!(job = key, run = %run_id, status = other, "job finished"),
    }
    state.events.publish(ServerEvent::JobFinished {
        key: key.to_string(),
        run_id,
        status: status.to_string(),
    });

    // `notifications.digest` is excluded so a broken notifier cannot notify about
    // itself in a loop.
    if status == "failed" && key != "notifications.digest" {
        let spec = crate::model::NotificationSpec::new(
            crate::model::NotificationEvent::SystemJobFailed,
            "notifications.system.job.failed.title",
            "notifications.system.job.failed.body",
        )
        // Passed as an i18n key so the job name resolves in the reader's language.
        .param_key("job", format!("jobs.{key}.name"))
        .link("/admin/jobs");
        crate::services::notify::emit(
            &state,
            &crate::model::Audience::permission(crate::model::Permission::SettingsManage),
            &spec,
        );
    }

    chain_after(&manager, &state, job, key, status);
}

fn classify_result(
    result: std::thread::Result<anyhow::Result<()>>,
    handle: &RunHandle,
) -> (&'static str, Option<String>) {
    match result {
        Ok(Ok(())) if handle.is_cancelled() => ("cancelled", None),
        Ok(Ok(())) => ("success", None),
        Ok(Err(e)) => ("failed", Some(format!("{e:#}"))),
        // `panic.as_ref()` yields the inner `dyn Any` payload; `&panic` would
        // unsize the Box itself and the downcast would always fail.
        Err(panic) => ("failed", Some(panic_message(panic.as_ref()))),
    }
}

// Retries, because a row left without a terminal status is only swept by
// `reconcile_running_runs` at startup and shows as running until then.
fn finalize_run(
    pool: &db::Pool,
    run_id: &str,
    key: &'static str,
    status: &str,
    finished_ms: i64,
    error: Option<&str>,
) -> bool {
    for attempt in 0..3u32 {
        match db::finish_job_run(pool, run_id, status, finished_ms, error) {
            Ok(_) => return true,
            Err(e) => {
                warn!(job = key, run = %run_id, attempt, error = %e, "failed to record job run finish; retrying");
                std::thread::sleep(std::time::Duration::from_millis(200 * u64::from(attempt + 1)));
            }
        }
    }
    false
}

// A failed or cancelled upstream must not start its dependents: they consume its
// outputs, and a cancel must not kick off more work.
fn chain_after(manager: &Arc<JobManager>, state: &SharedState, job: JobKey, key: &'static str, status: &str) {
    if status != "success" {
        return;
    }
    for next in manager.jobs_for_trigger(Trigger::AfterJob(job)) {
        if let Err(e) = manager.trigger(state.clone(), next, "chain") {
            warn!(job = key, next = %next, error = ?e, "chained job did not start");
        }
    }
}

fn panic_message(panic: &(dyn std::any::Any + Send)) -> String {
    if let Some(s) = panic.downcast_ref::<&str>() {
        format!("panicked: {s}")
    } else if let Some(s) = panic.downcast_ref::<String>() {
        format!("panicked: {s}")
    } else {
        "panicked".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::TempPool;

    fn test_pool() -> TempPool {
        crate::db::testing::temp_pool("jobs-test")
    }

    #[test]
    fn job_key_reads_as_str_and_displays() {
        let k = JobKey("cache.cleanup");
        assert_eq!(k.as_str(), "cache.cleanup");
        assert_eq!(k.to_string(), "cache.cleanup");
        let mut map = std::collections::HashMap::new();
        map.insert(k, 7);
        assert_eq!(map.get("cache.cleanup"), Some(&7));
    }

    #[test]
    fn panic_message_downcasts_str_string_or_falls_back() {
        let s: Box<dyn std::any::Any + Send> = Box::new("boom");
        assert_eq!(panic_message(s.as_ref()), "panicked: boom");
        let owned: Box<dyn std::any::Any + Send> = Box::new(String::from("kaboom"));
        assert_eq!(panic_message(owned.as_ref()), "panicked: kaboom");
        let other: Box<dyn std::any::Any + Send> = Box::new(42u32);
        assert_eq!(panic_message(other.as_ref()), "panicked");
    }

    #[test]
    fn classify_result_maps_every_outcome() {
        let handle = RunHandle::new("run-1".into(), "job".into());

        let ok: std::thread::Result<anyhow::Result<()>> = Ok(Ok(()));
        assert_eq!(classify_result(ok, &handle), ("success", None));

        let errd: std::thread::Result<anyhow::Result<()>> = Ok(Err(anyhow::anyhow!("nope")));
        let (status, msg) = classify_result(errd, &handle);
        assert_eq!(status, "failed");
        assert_eq!(msg.as_deref(), Some("nope"));

        let payload: Box<dyn std::any::Any + Send> = Box::new("splat");
        let panicked: std::thread::Result<anyhow::Result<()>> = Err(payload);
        assert_eq!(classify_result(panicked, &handle), ("failed", Some("panicked: splat".to_string())));

        handle.request_cancel();
        let ok2: std::thread::Result<anyhow::Result<()>> = Ok(Ok(()));
        assert_eq!(classify_result(ok2, &handle), ("cancelled", None));
    }

    #[test]
    fn manager_starts_empty_and_pause_toggles() {
        let m = JobManager::default();
        assert_eq!(m.running_count(), 0);
        assert!(!m.pipeline_paused());
        m.set_pipeline_paused(true);
        assert!(m.pipeline_paused());
        m.set_pipeline_paused(false);
        assert!(!m.pipeline_paused());
        assert!(!m.cancel(JobKey("nothing.here")));
        assert!(m.jobs_for_trigger(Trigger::LibraryChange).is_empty());
    }

    #[test]
    fn register_remote_is_resolvable() {
        let m = JobManager::new();
        let run: RemoteRun = Arc::new(|_ctx: &JobContext| Ok(()));
        m.register_remote("mod.job", Category::Maintenance, Some("0 4 * * *".into()), run);
        assert_eq!(m.resolve("mod.job"), Some(JobKey("mod.job")));
        assert_eq!(m.resolve("absent.job"), None);
    }

    #[test]
    fn update_schedule_validates_and_persists() {
        let pool = test_pool();
        let m = JobManager::new();
        assert!(m.update_schedule(&pool, JobKey("ghost.job"), None, None).is_err());

        let run: RemoteRun = Arc::new(|_ctx: &JobContext| Ok(()));
        m.register_remote("mod.job", Category::Maintenance, None, run);
        assert!(m
            .update_schedule(&pool, JobKey("mod.job"), Some(Some("not a valid cron".into())), None)
            .is_err());

        m.update_schedule(&pool, JobKey("mod.job"), Some(Some("0 4 * * *".into())), Some(false))
            .unwrap();
        let rows = db::list_job_schedules(&pool).unwrap();
        let saved =
            rows.iter().find(|(k, ..)| k.as_str() == "mod.job").expect("schedule row persisted");
        assert_eq!(saved.1.as_deref(), Some("0 4 * * *"));
        assert!(!saved.2); // disabled
    }

    fn noop_run(_ctx: &JobContext) -> anyhow::Result<()> {
        Ok(())
    }
    static TEST_BUILTIN: Builtin = Builtin {
        key: JobKey("test.job"),
        category: Category::Maintenance,
        schedule: Some("0 4 * * *"),
        triggers: &[Trigger::LibraryChange],
        run: noop_run,
    };

    #[test]
    fn register_builtin_is_resolvable_and_lists_for_its_trigger() {
        let mut m = JobManager::new();
        m.register(&TEST_BUILTIN);
        assert_eq!(m.resolve("test.job"), Some(JobKey("test.job")));
        assert_eq!(m.jobs_for_trigger(Trigger::LibraryChange), vec![JobKey("test.job")]);
        assert!(m.jobs_for_trigger(Trigger::AfterJob(JobKey("other.job"))).is_empty());
    }

    #[test]
    fn load_schedules_overlays_overrides_and_ignores_unknown() {
        let pool = test_pool();
        let mut m = JobManager::new();
        m.register(&TEST_BUILTIN);
        db::upsert_job_schedule(&pool, "test.job", Some("0 6 * * *"), false).unwrap();
        db::upsert_job_schedule(&pool, "ghost.job", Some("0 1 * * *"), true).unwrap();
        m.load_schedules(&pool);
        assert!(m.jobs_for_trigger(Trigger::LibraryChange).is_empty());
    }

    #[test]
    fn schedules_that_cannot_be_read_leave_the_built_in_defaults_in_place() {
        let pool = test_pool();
        let mut m = JobManager::new();
        m.register(&TEST_BUILTIN);
        pool.get().unwrap().execute("DROP TABLE job_schedules", []).unwrap();

        m.load_schedules(&pool);
        assert_eq!(m.jobs_for_trigger(Trigger::LibraryChange), vec![JobKey("test.job")]);
    }

    #[test]
    fn update_schedule_clears_builtin_to_manual_only() {
        let pool = test_pool();
        let mut m = JobManager::new();
        m.register(&TEST_BUILTIN);
        m.update_schedule(&pool, JobKey("test.job"), Some(None), None).unwrap();
        let rows = db::list_job_schedules(&pool).unwrap();
        let saved = rows.iter().find(|(k, ..)| k.as_str() == "test.job").expect("row persisted");
        assert!(saved.1.is_none(), "schedule cleared");
        assert!(saved.2, "still enabled");
    }

    #[test]
    fn finalize_run_records_terminal_status() {
        let pool = test_pool();
        db::insert_job_run(&pool, "run-x", "test.job", "manual", 1_000).unwrap();
        assert!(finalize_run(&pool, "run-x", "test.job", "success", 2_000, None));
        let runs = db::list_job_runs(&pool, "test.job", 10).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].status, "success");
        assert_eq!(runs[0].finished_at, Some(2_000));
    }

    #[test]
    fn finalize_run_records_failure_message() {
        let pool = test_pool();
        db::insert_job_run(&pool, "run-y", "test.job", "manual", 1_000).unwrap();
        assert!(finalize_run(&pool, "run-y", "test.job", "failed", 3_000, Some("boom")));
        let runs = db::list_job_runs(&pool, "test.job", 10).unwrap();
        assert_eq!(runs[0].status, "failed");
        assert_eq!(runs[0].error.as_deref(), Some("boom"));
    }

    #[test]
    fn cancel_all_on_idle_manager_is_a_noop() {
        let m = JobManager::new();
        m.cancel_all();
        assert_eq!(m.running_count(), 0);
    }

    #[test]
    fn register_remote_reregistration_stays_resolvable() {
        let m = JobManager::new();
        let run: RemoteRun = Arc::new(|_ctx: &JobContext| Ok(()));
        m.register_remote("mod.job", Category::Maintenance, Some("0 4 * * *".into()), run);
        let run2: RemoteRun = Arc::new(|_ctx: &JobContext| Ok(()));
        m.register_remote("mod.job", Category::Recommendations, Some("0 9 * * *".into()), run2);
        assert_eq!(m.resolve("mod.job"), Some(JobKey("mod.job")));
    }

    use crate::test_support;

    async fn wait_idle(mgr: &Arc<JobManager>) {
        for _ in 0..300 {
            if mgr.running_count() == 0 {
                return;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        panic!("job run did not finish within the timeout");
    }

    #[tokio::test]
    async fn trigger_runs_a_job_to_success_and_records_the_run() {
        let state = test_support::test_state();
        let run: RemoteRun = Arc::new(|ctx: &JobContext| {
            ctx.info("did the work");
            Ok(())
        });
        state.jobs.register_remote("test.remote.ok", Category::Maintenance, None, run);

        let run_id =
            state.jobs.trigger(state.clone(), JobKey("test.remote.ok"), "manual").expect("triggered");
        wait_idle(&state.jobs).await;

        let runs = db::list_job_runs(&state.db, "test.remote.ok", 10).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].id, run_id);
        assert_eq!(runs[0].status, "success");
        assert!(runs[0].finished_at.is_some());
        assert_eq!(state.jobs.running_count(), 0);
    }

    #[tokio::test]
    async fn trigger_records_a_failed_run_with_its_message() {
        let state = test_support::test_state();
        let run: RemoteRun = Arc::new(|_ctx: &JobContext| Err(anyhow::anyhow!("kaput")));
        state.jobs.register_remote("test.remote.err", Category::Maintenance, None, run);

        state.jobs.trigger(state.clone(), JobKey("test.remote.err"), "manual").expect("triggered");
        wait_idle(&state.jobs).await;

        let runs = db::list_job_runs(&state.db, "test.remote.err", 10).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].status, "failed");
        assert!(runs[0].error.as_deref().unwrap().contains("kaput"));
    }

    #[tokio::test]
    async fn trigger_rejects_a_second_run_while_one_is_in_flight() {
        let state = test_support::test_state();
        // Blocks until released, so the first run is provably still in flight when
        // the second trigger is attempted.
        let gate = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let g = gate.clone();
        let run: RemoteRun = Arc::new(move |_ctx: &JobContext| {
            while !g.load(std::sync::atomic::Ordering::Relaxed) {
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
            Ok(())
        });
        state.jobs.register_remote("test.remote.slow", Category::Maintenance, None, run);

        state.jobs.trigger(state.clone(), JobKey("test.remote.slow"), "manual").expect("first run");
        let second = state.jobs.trigger(state.clone(), JobKey("test.remote.slow"), "manual");
        assert_eq!(second, Err(TriggerError::AlreadyRunning));
        gate.store(true, std::sync::atomic::Ordering::Relaxed);
        wait_idle(&state.jobs).await;
    }

    fn until_cancelled() -> RemoteRun {
        Arc::new(|ctx: &JobContext| {
            while !ctx.cancelled() {
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
            Ok(())
        })
    }

    #[tokio::test]
    async fn cancelling_by_key_answers_whether_there_was_a_run_to_cancel() {
        let state = test_support::test_state();
        state.jobs.register_remote(
            "test.remote.cancel",
            Category::Maintenance,
            None,
            until_cancelled(),
        );
        state.jobs.trigger(state.clone(), JobKey("test.remote.cancel"), "manual").expect("triggered");

        assert!(state.jobs.cancel(JobKey("test.remote.cancel")), "the run was in flight");
        wait_idle(&state.jobs).await;
        assert!(!state.jobs.cancel(JobKey("test.remote.cancel")), "and is not, once it is over");

        let runs = db::list_job_runs(&state.db, "test.remote.cancel", 10).unwrap();
        assert_eq!(runs[0].status, "cancelled");
    }

    #[tokio::test]
    async fn cancel_all_reaches_every_run_at_once() {
        let state = test_support::test_state();
        for key in ["test.remote.all.a", "test.remote.all.b"] {
            state.jobs.register_remote(key, Category::Maintenance, None, until_cancelled());
            state.jobs.trigger(state.clone(), JobKey(key), "manual").expect("triggered");
        }
        assert_eq!(state.jobs.running_count(), 2);

        state.jobs.cancel_all();
        wait_idle(&state.jobs).await;
        for key in ["test.remote.all.a", "test.remote.all.b"] {
            assert_eq!(db::list_job_runs(&state.db, key, 10).unwrap()[0].status, "cancelled");
        }
    }

    #[tokio::test]
    async fn a_builtin_runs_through_the_same_path_as_a_module_job() {
        let state = test_support::test_state();
        let manager = Arc::new({
            let mut m = JobManager::new();
            m.register(&TEST_BUILTIN);
            m
        });

        let run_id = manager.trigger(state.clone(), JobKey("test.job"), "manual").expect("triggered");
        wait_idle(&manager).await;

        let runs = db::list_job_runs(&state.db, "test.job", 10).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].id, run_id);
        assert_eq!(runs[0].status, "success");
    }

    #[tokio::test]
    async fn a_run_whose_ledger_refuses_every_write_still_releases_its_slot() {
        let state = test_support::test_state();
        state.db.get().unwrap().execute("DROP TABLE job_runs", []).unwrap();
        let run: RemoteRun = Arc::new(|_ctx: &JobContext| Ok(()));
        state.jobs.register_remote("test.remote.noledger", Category::Maintenance, None, run);

        state
            .jobs
            .trigger(state.clone(), JobKey("test.remote.noledger"), "manual")
            .expect("triggered");
        wait_idle(&state.jobs).await;
        assert_eq!(state.jobs.running_count(), 0);
    }

    #[test]
    fn trigger_unknown_job_is_rejected() {
        let state = test_support::test_state();
        assert_eq!(
            state.jobs.trigger(state.clone(), JobKey("does.not.exist"), "manual"),
            Err(TriggerError::Unknown)
        );
    }

    static CHAIN_GATE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

    fn wait_for_the_gate(_ctx: &JobContext) -> anyhow::Result<()> {
        while !CHAIN_GATE.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        Ok(())
    }

    static CHAINED_BUILTIN: Builtin = Builtin {
        key: JobKey("test.chained"),
        category: Category::Maintenance,
        schedule: None,
        triggers: &[Trigger::AfterJob(JobKey("test.job"))],
        run: wait_for_the_gate,
    };

    #[tokio::test]
    async fn a_dependent_still_running_from_the_last_pass_is_not_started_twice() {
        let state = test_support::test_state();
        let manager = Arc::new({
            let mut m = JobManager::new();
            m.register(&TEST_BUILTIN);
            m.register(&CHAINED_BUILTIN);
            m
        });
        CHAIN_GATE.store(false, Ordering::Relaxed);
        manager.trigger(state.clone(), JobKey("test.chained"), "manual").expect("triggered");

        chain_after(&manager, &state, JobKey("test.job"), "test.job", "success");

        assert_eq!(manager.running_count(), 1, "the chain must not queue a second run");
        CHAIN_GATE.store(true, Ordering::Relaxed);
        wait_idle(&manager).await;
        assert_eq!(db::list_job_runs(&state.db, "test.chained", 10).unwrap().len(), 1);
    }

    #[test]
    fn chain_after_does_not_fire_dependents_on_non_success() {
        let state = test_support::test_state();
        chain_after(&state.jobs, &state, JobKey("test.remote.ok"), "test.remote.ok", "failed");
        chain_after(&state.jobs, &state, JobKey("test.remote.ok"), "test.remote.ok", "cancelled");
        assert_eq!(state.jobs.running_count(), 0);
    }
}
