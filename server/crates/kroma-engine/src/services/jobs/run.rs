use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::Arc;

use tracing::{info, warn};

use crate::db;
use crate::infra::events::ServerEvent;
use crate::state::SharedState;

use super::{
    now_ms, JobContext, JobKey, JobManager, RunHandle, Runner, Trigger, RUNS_KEPT,
};

#[cfg(test)]
mod tests;

#[allow(clippy::too_many_arguments)]
pub(super) fn run_job(
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
