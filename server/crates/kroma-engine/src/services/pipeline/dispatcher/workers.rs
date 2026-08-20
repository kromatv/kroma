use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Instant;

use crate::db;
use crate::services::jobs::JobContext;

use super::super::stage::Stage;
use super::hold::wait_while_held;

// Returns one `TaskResult` per task actually processed; a cancel mid-batch may
// leave some unprocessed, and those stay `running` until the caller resets them.
pub(super) fn process_batch(
    stage: &Stage,
    ctx: &JobContext,
    batch: &[(String, String)],
) -> Vec<db::pipeline::TaskResult> {
    let next = AtomicUsize::new(0);
    let paused = AtomicBool::new(false);
    let slots: Vec<Mutex<Option<db::pipeline::TaskResult>>> =
        (0..batch.len()).map(|_| Mutex::new(None)).collect();
    // Hardware clamp on top of the per-stage setting: a stage tuned on a dev
    // machine (metadata: 8, probe: 4) must not oversubscribe a 2-core NAS.
    let cores = thread::available_parallelism().map(std::num::NonZeroUsize::get).unwrap_or(4);
    let workers = stage
        .concurrency
        .min(cores * 2)
        .max(1)
        .min(batch.len().max(1));
    thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| process_task_worker(&next, batch, ctx, &paused, &slots, stage));
        }
    });
    slots.into_iter().filter_map(|m| m.into_inner().unwrap()).collect()
}

// Pulls the next index off the batch until drained or cancelled; a panic in
// `process` is caught and recorded like an `Err` so it never unwinds out of scope.
fn process_task_worker(
    next: &AtomicUsize,
    batch: &[(String, String)],
    ctx: &JobContext,
    paused: &AtomicBool,
    slots: &[Mutex<Option<db::pipeline::TaskResult>>],
    stage: &Stage,
) {
    loop {
        let i = next.fetch_add(1, Ordering::Relaxed);
        if i >= batch.len() || ctx.cancelled() {
            break;
        }
        // Yield per item to the global pause (all stages) and, for the
        // playback-sensitive stages, to a live stream. Keeps an in-flight batch
        // from starting new ffmpeg the moment either fires.
        wait_while_held(ctx, paused, stage.pause_for_playback);
        if ctx.cancelled() {
            break;
        }
        let (id, _sig) = &batch[i];
        let started = Instant::now();
        // Catch a panic in `process` so one bad file can't unwind out of the
        // scope and skip `finish_batch`/`reset_running`, wedging the whole
        // claimed batch as `running`. A panic is recorded like a returned Err.
        let outcome =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| (stage.process)(ctx, id)));
        let duration_ms = started.elapsed().as_millis() as i64;
        let error = match outcome {
            Ok(Ok(())) => None,
            Ok(Err(e)) => Some(format!("{e:#}")),
            Err(_) => Some("panicked during processing".to_string()),
        };
        *slots[i].lock().unwrap() =
            Some(db::pipeline::TaskResult { id: id.clone(), error, duration_ms });
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::services::pipeline::dispatcher::test_support::{
        process_fail, process_ok, process_panic, test_stage,
    };
    use crate::services::pipeline::dispatcher::test_support::log_lines;
    use crate::test_support;

    #[test]
    fn process_batch_records_one_ok_result_per_task() {
        let state = test_support::test_state();
        let ctx = JobContext::for_test(state);
        let batch: Vec<(String, String)> =
            (0..3).map(|i| (format!("f{i}"), "sig".to_string())).collect();
        let results = process_batch(&test_stage(process_ok), &ctx, &batch);
        // One result per claimed subject, each recorded done (no error).
        assert_eq!(results.len(), 3);
        assert!(results.iter().all(|r| r.error.is_none()));
        let ids: std::collections::HashSet<_> = results.iter().map(|r| r.id.clone()).collect();
        assert_eq!(ids, ["f0", "f1", "f2"].iter().map(|s| s.to_string()).collect());
    }

    #[test]
    fn process_batch_surfaces_error_and_caught_panic() {
        let state = test_support::test_state();
        let ctx = JobContext::for_test(state);

        // A returned Err is recorded with its message.
        let failed = process_batch(&test_stage(process_fail), &ctx, &[("f1".into(), "s".into())]);
        assert_eq!(failed.len(), 1);
        assert!(failed[0].error.as_deref().unwrap().contains("boom: f1"));

        // A panic in `process` is caught and recorded like an Err, never unwinding
        // out of the scoped worker (silence the panic hook so the caught panic
        // doesn't spam the test output).
        let prev = std::panic::take_hook();
        std::panic::set_hook(Box::new(|_| {}));
        let panicked = process_batch(&test_stage(process_panic), &ctx, &[("f2".into(), "s".into())]);
        std::panic::set_hook(prev);
        assert_eq!(panicked.len(), 1);
        assert_eq!(panicked[0].error.as_deref(), Some("panicked during processing"));
    }

    #[test]
    fn process_task_worker_drains_the_batch_cooperatively() {
        let state = test_support::test_state();
        let ctx = JobContext::for_test(state);
        let batch: Vec<(String, String)> =
            (0..4).map(|i| (format!("f{i}"), "sig".to_string())).collect();
        let next = AtomicUsize::new(0);
        let paused = AtomicBool::new(false);
        let slots: Vec<Mutex<Option<db::pipeline::TaskResult>>> =
            (0..batch.len()).map(|_| Mutex::new(None)).collect();
        let stage = test_stage(process_ok);
        // A single worker pulls every index off the shared cursor until drained.
        process_task_worker(&next, &batch, &ctx, &paused, &slots, &stage);
        let filled = slots.iter().filter(|m| m.lock().unwrap().is_some()).count();
        assert_eq!(filled, 4);
        assert!(next.load(Ordering::Relaxed) >= 4);
    }

    #[test]
    fn a_worker_that_parked_says_so_once_the_hold_lifts() {
        let state = test_support::test_state();
        let ctx = JobContext::for_test(state.clone());
        let mut rx = state.events.subscribe();
        let paused = AtomicBool::new(true);
        wait_while_held(&ctx, &paused, false);
        assert!(!paused.load(Ordering::Relaxed));
        assert_eq!(log_lines(&mut rx), vec!["resuming".to_string()]);
    }

    #[test]
    fn a_worker_parked_by_the_admin_hold_gives_up_when_the_run_is_cancelled() {
        use crate::services::jobs::RunHandle;
        let state = test_support::test_state();
        let handle = std::sync::Arc::new(RunHandle::new("r".into(), "k".into()));
        let ctx = JobContext::from_handle(state.clone(), handle.clone());
        let mut rx = state.events.subscribe();
        state.jobs.set_pipeline_paused(true);

        let cancel_after = std::sync::Arc::clone(&handle);
        std::thread::spawn(move || {
            thread::sleep(Duration::from_millis(200));
            cancel_after.request_cancel();
        });

        let batch = [("f0".to_string(), "sig".to_string())];
        let next = AtomicUsize::new(0);
        let paused = AtomicBool::new(false);
        let slots: Vec<Mutex<Option<db::pipeline::TaskResult>>> = vec![Mutex::new(None)];
        process_task_worker(&next, &batch, &ctx, &paused, &slots, &test_stage(process_ok));

        assert!(slots[0].lock().unwrap().is_none(), "the held task was never started");
        assert_eq!(log_lines(&mut rx), vec!["paused (pipeline held by admin)".to_string()]);
    }
}
