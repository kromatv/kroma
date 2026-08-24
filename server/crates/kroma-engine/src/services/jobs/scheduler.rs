//! The cron tick loop and due-job selection split out of [`super`] (the job
//! manager) to keep that file focused and to give the scheduler's boundary
//! arithmetic its own home + tests. These are `impl JobManager` methods in a
//! sibling file; same-module privacy lets them touch the manager's private state.

use std::sync::Arc;
use std::time::Duration as StdDuration;

use time::OffsetDateTime;
use tracing::info;

use super::{now_local, Cron, JobKey, JobManager, TriggerError};
use crate::state::SharedState;

// Any cron time in the `(previous tick, now]` window triggers, so this only
// bounds latency; a minute-granularity schedule needs a tick below 60s.
const TICK: StdDuration = StdDuration::from_secs(30);

impl JobManager {
    /// Spawn the cron tick loop. Fires any schedule whose time falls in the
    /// `(last tick, now]` window so a server that was down does **not**
    /// retroactively run missed jobs, and the tick rate only bounds latency.
    pub fn spawn_scheduler(self: Arc<Self>, state: SharedState) {
        tokio::spawn(async move {
            let mut last = now_local(&state);
            let mut ticker = tokio::time::interval(TICK);
            // The immediate first tick establishes the baseline; nothing fires
            // until a scheduled time elapses after it.
            ticker.tick().await;
            loop {
                ticker.tick().await;
                let now = now_local(&state);
                self.trigger_due(&state, last, now);
                last = now;
            }
        });
    }

    fn trigger_due(
        self: &Arc<Self>,
        state: &SharedState,
        last: OffsetDateTime,
        now: OffsetDateTime,
    ) {
        for job in self.due_jobs(last, now) {
            match self.trigger(state.clone(), job, "schedule") {
                Ok(_) => {}
                Err(TriggerError::AlreadyRunning) => {
                    info!(
                        job = job.as_str(),
                        "skipped scheduled run; previous run still active"
                    )
                }
                Err(TriggerError::Unknown) => {}
            }
        }
    }

    // A fire-time exactly equal to `now` is included here and excluded from the
    // next window, so a boundary job fires exactly once.
    fn due_jobs(&self, last: OffsetDateTime, now: OffsetDateTime) -> Vec<JobKey> {
        let map = self.schedules.read().unwrap();
        map.iter()
            .filter(|(_, st)| st.enabled)
            .filter_map(|(job, st)| {
                let expr = st.schedule.as_deref()?;
                let cron = Cron::parse(expr).ok()?;
                match cron.next_after(last) {
                    Some(fire) if fire <= now => Some(*job),
                    _ => None,
                }
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::super::{Builtin, JobKey, JobManager, RunHandle, ScheduleState};
    use super::TICK;
    use crate::db;
    use crate::model::Category;
    use crate::test_support;
    use time::macros::datetime;
    use time::OffsetDateTime;

    const CACHE_CLEANUP: JobKey = JobKey("cache.cleanup");
    const ARTWORK_SWEEP: JobKey = JobKey("artwork.sweep");
    const NEVER_REGISTERED: JobKey = JobKey("ghost.job");

    // `register` wants a `'static` descriptor, so leak one — the test process is
    // short-lived.
    fn add_job(jm: &mut JobManager, key: JobKey, schedule: Option<&'static str>) {
        let builtin: &'static Builtin = Box::leak(Box::new(Builtin {
            key,
            category: Category::Maintenance,
            schedule,
            triggers: &[],
            run: |_| Ok(()),
        }));
        jm.register(builtin);
    }

    fn with_job(schedule: Option<&'static str>) -> JobManager {
        let mut jm = JobManager::new();
        add_job(&mut jm, CACHE_CLEANUP, schedule);
        jm
    }

    fn due(jm: &JobManager, last: OffsetDateTime, now: OffsetDateTime) -> Vec<JobKey> {
        jm.due_jobs(last, now)
    }

    #[test]
    fn fires_once_across_the_boundary() {
        let jm = with_job(Some("0 4 * * *"));
        // 04:00 falls in (03:59:50, 04:00:10] → fires.
        assert_eq!(
            due(
                &jm,
                datetime!(2026-06-29 03:59:50 UTC),
                datetime!(2026-06-29 04:00:10 UTC)
            ),
            [CACHE_CLEANUP]
        );
        // The immediately-following window must NOT re-fire it.
        assert!(due(
            &jm,
            datetime!(2026-06-29 04:00:10 UTC),
            datetime!(2026-06-29 04:00:40 UTC)
        )
        .is_empty());
    }

    #[test]
    fn fire_exactly_at_now_is_included_once() {
        let jm = with_job(Some("0 4 * * *"));
        // A window ENDING exactly at the fire time includes it…
        assert_eq!(
            due(
                &jm,
                datetime!(2026-06-29 03:59:50 UTC),
                datetime!(2026-06-29 04:00:00 UTC)
            ),
            [CACHE_CLEANUP]
        );
        // …and the next window STARTING at it excludes it (no double-fire).
        assert!(due(
            &jm,
            datetime!(2026-06-29 04:00:00 UTC),
            datetime!(2026-06-29 04:00:10 UTC)
        )
        .is_empty());
    }

    #[test]
    fn manual_only_and_disabled_never_fire() {
        // No schedule (manual-only) → never due.
        let jm = with_job(None);
        assert!(due(
            &jm,
            datetime!(2026-06-29 00:00:00 UTC),
            datetime!(2026-06-30 00:00:00 UTC)
        )
        .is_empty());

        // Disabled job → never due even inside its window.
        let jm = with_job(Some("0 4 * * *"));
        jm.schedules
            .write()
            .unwrap()
            .get_mut("cache.cleanup")
            .unwrap()
            .enabled = false;
        assert!(due(
            &jm,
            datetime!(2026-06-29 03:59:50 UTC),
            datetime!(2026-06-29 04:00:10 UTC)
        )
        .is_empty());
    }

    #[tokio::test]
    async fn a_due_job_starts_while_one_already_running_and_one_unregistered_are_left_alone() {
        let state = test_support::test_state();
        let mut jm = JobManager::new();
        add_job(&mut jm, CACHE_CLEANUP, Some("0 4 * * *"));
        add_job(&mut jm, ARTWORK_SWEEP, Some("0 4 * * *"));
        jm.schedules.write().unwrap().insert(
            NEVER_REGISTERED,
            ScheduleState {
                schedule: Some("0 4 * * *".to_string()),
                enabled: true,
                customized: false,
            },
        );
        let jm = Arc::new(jm);
        jm.running.write().unwrap().insert(
            ARTWORK_SWEEP,
            Arc::new(RunHandle::new(
                "run-1".into(),
                ARTWORK_SWEEP.as_str().into(),
            )),
        );
        let mut events = state.events.subscribe();

        jm.trigger_due(
            &state,
            datetime!(2026-06-29 03:59:50 UTC),
            datetime!(2026-06-29 04:00:10 UTC),
        );

        let announced = events
            .try_recv()
            .expect("the job that could start announced itself");
        let payload = announced.payload_unrouted();
        assert!(payload.contains("job.started"), "{payload}");
        assert!(payload.contains(CACHE_CLEANUP.as_str()), "{payload}");
        assert!(db::list_job_runs(&state.db, ARTWORK_SWEEP.as_str(), 10)
            .unwrap()
            .is_empty());
        assert!(db::list_job_runs(&state.db, NEVER_REGISTERED.as_str(), 10)
            .unwrap()
            .is_empty());
    }

    #[tokio::test(start_paused = true)]
    async fn the_tick_loop_sweeps_without_starting_a_job_whose_time_has_not_come() {
        let state = test_support::test_state();
        let jm = Arc::new(with_job(Some("0 4 1 1 *")));
        let mut events = state.events.subscribe();

        jm.clone().spawn_scheduler(state.clone());
        for _ in 0..3 {
            tokio::task::yield_now().await;
            tokio::time::advance(TICK * 2).await;
            tokio::task::yield_now().await;
        }

        assert!(
            events.try_recv().is_err(),
            "no schedule was due, so no run was announced"
        );
        assert_eq!(jm.running_count(), 0);
    }
}
