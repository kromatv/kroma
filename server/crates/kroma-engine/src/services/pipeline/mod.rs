//! Per-element processing pipeline.
//!
//! Turns the heavy monolithic library jobs (marker detection, storyboard
//! pre-generation, eventually probe/metadata/embed) into resumable, incremental,
//! per-subject work tracked in the `pipeline_tasks` ledger. Each **stage**
//! ([`stage::Stage`]) processes one subject at a time; the [`dispatcher`] drains
//! its queue (reconcile -> claim -> process -> record), and a job `SPEC` per
//! stage (in [`stages`]) plugs it into the existing scheduler/console for free.
//!
//! A re-run only does the non-done work, failures are individually visible and
//! retriable, and a freshly added file flows through without waiting for the
//! next whole-library sweep.

pub mod dispatcher;
pub mod elements;
pub mod reprocess;
pub mod stage;
pub mod stages;

// Short keys of the stages that ship today, in DAG order. The admin Pipeline
// dashboard iterates this to show a card per stage even before any task exists.
pub const STAGE_KEYS: &[(&str, &str, &str)] = &[
    // (short, full job key, subject_kind) in DAG order.
    (stages::probe::STAGE.short, stages::probe::STAGE.key, stages::probe::STAGE.subject_kind),
    (
        stages::loudness::STAGE.short,
        stages::loudness::STAGE.key,
        stages::loudness::STAGE.subject_kind,
    ),
    (stages::metadata::STAGE.short, stages::metadata::STAGE.key, stages::metadata::STAGE.subject_kind),
    (
        stages::storyboard::STAGE.short,
        stages::storyboard::STAGE.key,
        stages::storyboard::STAGE.subject_kind,
    ),
    (
        stages::subtitles::STAGE.short,
        stages::subtitles::STAGE.key,
        stages::subtitles::STAGE.subject_kind,
    ),
    (stages::markers::STAGE.short, stages::markers::STAGE.key, stages::markers::STAGE.subject_kind),
    (stages::embed::STAGE.short, stages::embed::STAGE.key, stages::embed::STAGE.subject_kind),
];

/// Startup crash-recovery: any ledger task left `running` by a process that died
/// mid-drain is reset to `pending`, mirroring [`crate::db::reconcile_running_runs`]
/// for job runs. Call once at startup.
pub fn recover_on_boot(pool: &crate::db::Pool) {
    match crate::db::pipeline::reset_running(pool, None) {
        Ok(n) if n > 0 => {
            tracing::info!(reset = n, "pipeline: reset stranded running tasks to pending");
        }
        Ok(_) => {}
        Err(e) => tracing::warn!(error = %e, "pipeline: failed to reset stranded running tasks"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_task_stranded_running_by_a_dead_process_is_handed_back_at_boot() {
        let pool = crate::db::testing::temp_pool("pipeline-recover");
        crate::db::pipeline::enqueue(&pool, "probe", "item", "m1", 0, 1).unwrap();
        crate::db::pipeline::claim_batch(&pool, "probe", 1, 2).unwrap();

        recover_on_boot(&pool);

        let (pending, running, ..) = crate::db::pipeline::counts(&pool, "probe").unwrap();
        assert_eq!((pending, running), (1, 0));
    }

    #[test]
    fn a_ledger_that_cannot_be_read_at_boot_is_logged_rather_than_fatal() {
        let pool = crate::db::testing::temp_pool("pipeline-recover-broken");
        pool.get().unwrap().execute_batch("DROP TABLE pipeline_tasks").unwrap();
        assert!(crate::db::pipeline::reset_running(&pool, None).is_err());

        recover_on_boot(&pool);

        assert!(pool.get().is_ok(), "a failed recovery must not cost the pool");
    }
}
