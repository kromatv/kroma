//! Background job system: a scheduler + registry that runs named units of work on
//! a cron schedule or on demand, with every run tracked (status, progress, logs,
//! errors) in SQLite. Handlers and their [`Builtin`] specs live in [`builtins`].

mod builtins;
mod context;
mod cron;
mod registry;
mod run;
mod scheduler;
mod trigger;
mod views;

#[cfg(test)]
mod test_support;

pub use builtins::{register_all, Builtin};
pub use context::{JobContext, RunHandle};
pub use cron::Cron;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

use time::OffsetDateTime;

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
}

impl Default for JobManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
