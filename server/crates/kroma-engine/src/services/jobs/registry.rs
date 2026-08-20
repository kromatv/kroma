use anyhow::{anyhow, Result};
use tracing::warn;

use crate::db;
use crate::model::Category;

use super::{
    Builtin, Cron, JobKey, JobManager, RemoteJob, RemoteRun, ScheduleState, Trigger,
};

impl JobManager {
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

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::services::jobs::test_support::{test_pool, TEST_BUILTIN};
    use crate::services::jobs::{JobContext, RemoteRun};

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
    fn register_remote_reregistration_stays_resolvable() {
        let m = JobManager::new();
        let run: RemoteRun = Arc::new(|_ctx: &JobContext| Ok(()));
        m.register_remote("mod.job", Category::Maintenance, Some("0 4 * * *".into()), run);
        let run2: RemoteRun = Arc::new(|_ctx: &JobContext| Ok(()));
        m.register_remote("mod.job", Category::Recommendations, Some("0 9 * * *".into()), run2);
        assert_eq!(m.resolve("mod.job"), Some(JobKey("mod.job")));
    }
}
