//! The API read models for the job console, split out of [`super`] to keep the
//! manager file focused; same-module privacy lets them read its private state.

use time::OffsetDateTime;

use super::{now_local, Cron, JobKey, JobManager, RUNS_KEPT};
use crate::db;
use crate::model::{JobDetail, JobInfo};
use crate::state::SharedState;

impl JobManager {
    /// In registration order: the built-ins first, then the remote module jobs.
    pub fn list(&self, state: &SharedState) -> Vec<JobInfo> {
        let now = now_local(state);
        let pool = state.db.clone();
        let remote = self.remote_order.read().unwrap().clone();
        self.order
            .iter()
            .copied()
            .chain(remote)
            .filter_map(|job| self.info_for(&pool, now, job))
            .collect()
    }

    pub fn detail(&self, state: &SharedState, job: JobKey) -> Option<JobDetail> {
        let now = now_local(state);
        let pool = state.db.clone();
        let info = self.info_for(&pool, now, job)?;
        let runs = db::list_job_runs(&pool, job.as_str(), RUNS_KEPT).unwrap_or_default();
        Some(JobDetail { info, runs })
    }

    fn info_for(&self, pool: &db::Pool, now: OffsetDateTime, job: JobKey) -> Option<JobInfo> {
        let st = self.schedules.read().unwrap().get(&job).cloned()?;

        let (category, default_schedule) = match self.jobs.get(&job) {
            Some(b) => (b.category, b.schedule.map(str::to_string)),
            None => {
                let remote = self.remote.read().unwrap();
                let r = remote.get(job.as_str())?;
                (r.category, r.schedule.clone())
            }
        };

        let next_run_at = if st.enabled {
            st.schedule
                .as_deref()
                .and_then(|e| Cron::parse(e).ok())
                .and_then(|c| c.next_after(now))
                .map(|t| (t.unix_timestamp_nanos() / 1_000_000) as i64)
        } else {
            None
        };

        let running = self.running.read().unwrap().get(&job).cloned();
        let (progress_done, progress_total) = match &running {
            Some(h) => {
                let (d, t) = h.progress();
                (Some(d), Some(t))
            }
            None => (None, None),
        };

        Some(JobInfo {
            key: job.as_str().to_string(),
            name: format!("jobs.{}.name", job.as_str()),
            description: format!("jobs.{}.desc", job.as_str()),
            category,
            schedule: st.schedule.clone(),
            default_schedule,
            customized: st.customized,
            enabled: st.enabled,
            running: running.is_some(),
            run_id: running.as_ref().map(|h| h.run_id.clone()),
            progress_done,
            progress_total,
            next_run_at,
            last_run: db::last_job_run(pool, job.as_str()).ok().flatten(),
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::test_support::test_state;

    const KNOWN: &str = "cache.cleanup";

    #[test]
    fn lists_every_registered_job() {
        let state = test_state();
        let infos = state.jobs.list(&state);
        assert!(!infos.is_empty(), "the built-ins are registered at startup");
        assert!(
            infos.iter().any(|i| i.key == KNOWN),
            "{:?}",
            infos.iter().map(|i| &i.key).collect::<Vec<_>>()
        );
    }

    #[test]
    fn names_jobs_by_i18n_key_rather_than_in_english() {
        let state = test_state();
        for info in state.jobs.list(&state) {
            assert_eq!(info.name, format!("jobs.{}.name", info.key));
            assert_eq!(info.description, format!("jobs.{}.desc", info.key));
        }
    }

    #[test]
    fn reports_nothing_running_on_a_quiet_server() {
        let state = test_state();
        for info in state.jobs.list(&state) {
            assert!(!info.running);
            assert!(info.run_id.is_none());
            // None rather than 0/0: the console renders a bar whenever it has numbers.
            assert!(info.progress_done.is_none());
            assert!(info.progress_total.is_none());
        }
    }

    #[test]
    fn schedules_a_next_run_for_an_enabled_job() {
        let state = test_state();
        let info = state
            .jobs
            .list(&state)
            .into_iter()
            .find(|i| i.key == KNOWN)
            .unwrap();
        assert!(info.enabled, "built-ins start enabled");
        assert!(
            info.next_run_at.is_some(),
            "a cron'd job knows when it fires next"
        );
        assert!(!info.customized, "and says so until an admin changes it");
    }

    #[test]
    fn a_disabled_job_has_no_next_run() {
        let state = test_state();
        let job = state.jobs.resolve(KNOWN).unwrap();
        state
            .jobs
            .update_schedule(&state.db, job, None, Some(false))
            .unwrap();

        let info = state
            .jobs
            .list(&state)
            .into_iter()
            .find(|i| i.key == KNOWN)
            .unwrap();
        assert!(!info.enabled);
        assert!(info.next_run_at.is_none());
        assert!(info.customized, "an admin touched it");
    }

    #[test]
    fn an_unparseable_schedule_yields_no_next_run_rather_than_an_error() {
        let state = test_state();
        let job = state.jobs.resolve(KNOWN).unwrap();
        // `update_schedule` rejects invalid cron, so the only holdable value is None.
        state
            .jobs
            .update_schedule(&state.db, job, Some(None), None)
            .unwrap();

        let info = state
            .jobs
            .list(&state)
            .into_iter()
            .find(|i| i.key == KNOWN)
            .unwrap();
        assert!(info.schedule.is_none());
        assert!(info.next_run_at.is_none());
    }

    #[test]
    fn keeps_the_builtin_default_alongside_an_admins_override() {
        let state = test_state();
        let job = state.jobs.resolve(KNOWN).unwrap();
        state
            .jobs
            .update_schedule(&state.db, job, Some(Some("0 5 * * *".into())), None)
            .unwrap();

        let info = state
            .jobs
            .list(&state)
            .into_iter()
            .find(|i| i.key == KNOWN)
            .unwrap();
        assert_eq!(info.schedule.as_deref(), Some("0 5 * * *"));
        assert!(info.default_schedule.is_some());
        assert_ne!(info.schedule, info.default_schedule);
    }

    #[test]
    fn detail_carries_the_info_plus_an_empty_history() {
        let state = test_state();
        let job = state.jobs.resolve(KNOWN).unwrap();
        let detail = state
            .jobs
            .detail(&state, job)
            .expect("a known job has a detail view");

        assert_eq!(detail.info.key, KNOWN);
        assert!(detail.runs.is_empty());
        assert!(detail.info.last_run.is_none());
    }

    #[tokio::test]
    async fn a_module_job_is_listed_after_the_builtins_with_its_own_schedule() {
        use crate::model::Category;
        use crate::services::jobs::RemoteRun;

        let state = test_state();
        let run: RemoteRun = std::sync::Arc::new(|_ctx| Ok(()));
        state.jobs.register_remote(
            "mod.listed",
            Category::Maintenance,
            Some("0 4 * * *".into()),
            run,
        );

        let infos = state.jobs.list(&state);
        let listed = infos.last().expect("at least one job");
        assert_eq!(
            listed.key, "mod.listed",
            "module jobs come after the built-ins"
        );
        assert_eq!(listed.default_schedule.as_deref(), Some("0 4 * * *"));
        assert!(listed.next_run_at.is_some());
    }

    #[tokio::test]
    async fn a_running_job_reports_the_progress_it_last_published() {
        use crate::model::Category;
        use crate::services::jobs::{JobKey, RemoteRun};

        let state = test_state();
        let run: RemoteRun = std::sync::Arc::new(|ctx| {
            ctx.progress(3, 10);
            while !ctx.cancelled() {
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
            Ok(())
        });
        state
            .jobs
            .register_remote("mod.progressing", Category::Maintenance, None, run);
        let run_id = state
            .jobs
            .trigger(state.clone(), JobKey("mod.progressing"), "manual")
            .expect("triggered");

        let mut info = None;
        for _ in 0..300 {
            let found = state
                .jobs
                .list(&state)
                .into_iter()
                .find(|i| i.key == "mod.progressing")
                .expect("registered");
            if found.progress_done == Some(3) {
                info = Some(found);
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        let info = info.expect("the run published its progress");
        assert!(info.running);
        assert_eq!(info.run_id.as_deref(), Some(run_id.as_str()));
        assert_eq!(info.progress_total, Some(10));

        state.jobs.cancel(JobKey("mod.progressing"));
    }

    #[test]
    fn resolves_no_key_for_a_job_that_does_not_exist() {
        let state = test_state();
        assert!(state.jobs.resolve("nope.not.a.job").is_none());
    }
}
