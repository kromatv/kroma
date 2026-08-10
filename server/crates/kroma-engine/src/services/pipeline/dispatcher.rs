//! The stage driver. One call to [`run`] does a whole stage-drain: reconcile the
//! ledger against the current catalog, then claim -> process -> record in
//! batches until the queue is empty or the run is cancelled.
//!
//! Runs on the job's blocking thread and owns every `pipeline_tasks` write
//! (batched into one transaction), so workers never contend on SQLite's single writer.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use anyhow::Result;

use crate::db;
use crate::infra::events::ServerEvent;
use crate::services::jobs::{now_ms, JobContext};

use super::stage::Stage;

// Small enough that a cancel is observed promptly; large enough that the
// per-batch DB round-trips are negligible next to the ffmpeg/TMDB work.
const BATCH: usize = 32;
const PAUSE_POLL_S: u64 = 4;

// How often the drain logs a progress line (with elapsed + ETA) during a long
// run, so a multi-minute stage isn't silent between "in scope" and "finished".
const LOG_EVERY_MS: i64 = 10_000;

/// Drain one stage to completion (or cancellation).
pub fn run(stage: &Stage, ctx: &JobContext) -> Result<()> {
    let pool = &ctx.state.db;
    let started = Instant::now();

    // Any `running` row here was stranded by an earlier drain that died
    // mid-batch; `reconcile` deliberately never touches those, so this must.
    match db::pipeline::reset_running(pool, Some(stage.short)) {
        Ok(0) => {}
        Ok(n) => ctx.warn(format!(
            "{}: re-queued {n} task(s) left running by an interrupted earlier drain",
            stage.short
        )),
        Err(e) => {
            ctx.warn(format!("{}: failed to reclaim stranded tasks: {e:#}", stage.short))
        }
    }

    let subjects = (stage.enumerate)(&ctx.state)?;
    db::pipeline::reconcile(pool, stage.short, stage.subject_kind, &subjects, now_ms())?;
    ctx.info(format!(
        "{}: {} subject(s) in scope (scanned in {})",
        stage.short,
        subjects.len(),
        fmt_dur(started.elapsed()),
    ));

    // The pending count after reconcile is the progress denominator; enqueues
    // arriving mid-run just extend it (progress is clamped to 100%).
    let total = pending_count(pool, stage.short)?;
    if total == 0 {
        ctx.info(format!("{}: nothing to do (already up to date)", stage.short));
        return Ok(());
    }
    ctx.info(format!("{}: draining {total} pending task(s)…", stage.short));

    let drained = drain_loop(stage, ctx, total);

    // A mid-batch cancel or an aborted loop can leave tasks claimed but
    // unprocessed; reset them to `pending` here regardless of how the loop exited.
    if let Err(e) = db::pipeline::reset_running(pool, Some(stage.short)) {
        ctx.warn(format!("{}: failed to reset leftover running tasks: {e:#}", stage.short));
    }
    emit_stats(stage, ctx); // final authoritative push
    drained?;
    let (_pending, _running, done, failed, _blocked) = db::pipeline::counts(pool, stage.short)?;
    ctx.info(format!(
        "{}: finished in {} - {done} done, {failed} failed",
        stage.short,
        fmt_dur(started.elapsed()),
    ));
    Ok(())
}

// The claim -> process -> record loop of `run`. Split out so the caller can
// guarantee cleanup on every exit path, including a `?` on a DB error here.
fn drain_loop(stage: &Stage, ctx: &JobContext, total: usize) -> Result<()> {
    let pool = &ctx.state.db;
    let drain_started = Instant::now();
    let mut processed = 0usize;
    let mut failed_seen = 0usize;
    let mut stats_flush_ms = 0i64;
    let mut log_flush_ms = now_ms();
    let mut hold_logged = false;
    loop {
        if ctx.cancelled() {
            ctx.info(format!(
                "{}: cancelled after {processed}/{total} in {}",
                stage.short,
                fmt_dur(drain_started.elapsed()),
            ));
            break;
        }
        // Global pause: park the whole drain BEFORE claiming, so a paused pipeline
        // holds nothing `running` (in-flight batches also yield per item below).
        while ctx.state.jobs.pipeline_paused() && !ctx.cancelled() {
            if !hold_logged {
                ctx.info(format!("{}: paused (pipeline held by admin)", stage.short));
                hold_logged = true;
            }
            thread::sleep(Duration::from_secs(PAUSE_POLL_S));
        }
        if ctx.cancelled() {
            ctx.info(format!("{}: cancelled while paused", stage.short));
            break;
        }
        if hold_logged {
            ctx.info(format!("{}: resumed", stage.short));
            hold_logged = false;
        }
        let batch = db::pipeline::claim_batch(pool, stage.short, BATCH, now_ms())?;
        if batch.is_empty() {
            break;
        }
        let results = process_batch(stage, ctx, &batch);
        db::pipeline::finish_batch(pool, stage.short, &results, now_ms())?;
        processed += results.len();
        failed_seen += results.iter().filter(|r| r.error.is_some()).count();
        ctx.progress(processed.min(total), total);
        maybe_emit_stats(stage, ctx, &mut stats_flush_ms);
        maybe_log_progress(ctx, stage.short, processed, total, failed_seen, drain_started, &mut log_flush_ms);
    }
    Ok(())
}

// Human-readable elapsed time (`820 ms` · `4.3 s` · `2 min 05 s` · `1 h 07 min`).
fn fmt_dur(d: Duration) -> String {
    let ms = d.as_millis();
    if ms < 1000 {
        return format!("{ms} ms");
    }
    let secs = d.as_secs();
    if secs < 60 {
        return format!("{:.1} s", d.as_secs_f64());
    }
    let (m, s) = (secs / 60, secs % 60);
    if m < 60 {
        format!("{m} min {s:02} s")
    } else {
        format!("{} h {:02} min", m / 60, m % 60)
    }
}

// Throttled progress line during a drain: `storyboard: 605/4146, 0 failed ·
// 3 min 12 s elapsed · ~18 min 40 s left`.
fn maybe_log_progress(
    ctx: &JobContext,
    short: &str,
    processed: usize,
    total: usize,
    failed: usize,
    drain_started: Instant,
    last_ms: &mut i64,
) {
    let now = now_ms();
    if now - *last_ms < LOG_EVERY_MS {
        return;
    }
    *last_ms = now;
    let elapsed = drain_started.elapsed();
    let rate = processed as f64 / elapsed.as_secs_f64().max(0.001);
    let remaining = total.saturating_sub(processed);
    let eta = if rate > 0.0 {
        fmt_dur(Duration::from_secs_f64((remaining as f64 / rate).min(1e8)))
    } else {
        "?".to_string()
    };
    ctx.info(format!(
        "{short}: {processed}/{total}, {failed} failed · {} elapsed · ~{eta} left",
        fmt_dur(elapsed),
    ));
}

// Pending + still-running tasks after reconcile = the drain's denominator.
fn pending_count(pool: &db::Pool, stage: &str) -> Result<usize> {
    let (pending, running, ..) = db::pipeline::counts(pool, stage)?;
    Ok((pending + running).max(0) as usize)
}

// Returns one `TaskResult` per task actually processed; a cancel mid-batch may
// leave some unprocessed, and those stay `running` until the caller resets them.
fn process_batch(
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

// Blocks while the global pipeline pause is set, or (for a playback-sensitive
// stage) a stream is live. Logs the hold/resume transition once per worker.
fn wait_while_held(ctx: &JobContext, paused: &AtomicBool, pause_for_playback: bool) {
    loop {
        if ctx.cancelled() {
            return;
        }
        let admin_hold = ctx.state.jobs.pipeline_paused();
        let playback_hold = pause_for_playback && !ctx.state.playback.list().is_empty();
        if !admin_hold && !playback_hold {
            if paused.swap(false, Ordering::Relaxed) {
                ctx.info("resuming");
            }
            return;
        }
        if !paused.swap(true, Ordering::Relaxed) {
            ctx.info(hold_reason(admin_hold));
        }
        thread::sleep(Duration::from_secs(PAUSE_POLL_S));
    }
}

// The log line for a hold, depending on which side asked for it.
fn hold_reason(admin_hold: bool) -> &'static str {
    if admin_hold {
        "paused (pipeline held by admin)"
    } else {
        "playback active, pausing (playback has priority)"
    }
}

// Throttled to ~1/s: the WS event is cheap but the count query is a round-trip.
fn maybe_emit_stats(stage: &Stage, ctx: &JobContext, last_ms: &mut i64) {
    let now = now_ms();
    if now - *last_ms < 1000 {
        return;
    }
    *last_ms = now;
    emit_stats(stage, ctx);
}

fn emit_stats(stage: &Stage, ctx: &JobContext) {
    if let Ok(stat) =
        db::pipeline::stage_stat(&ctx.state.db, stage.short, stage.key, stage.subject_kind)
    {
        ctx.state.events.publish(ServerEvent::PipelineStats { stages: vec![stat] });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::TempPool;

    #[test]
    fn fmt_dur_scales_units() {
        assert_eq!(fmt_dur(Duration::from_millis(820)), "820 ms");
        assert_eq!(fmt_dur(Duration::from_millis(999)), "999 ms");
        assert_eq!(fmt_dur(Duration::from_millis(4300)), "4.3 s");
        assert_eq!(fmt_dur(Duration::from_secs(59)), "59.0 s");
        assert_eq!(fmt_dur(Duration::from_secs(125)), "2 min 05 s");
        assert_eq!(fmt_dur(Duration::from_secs(3600 + 7 * 60)), "1 h 07 min");
    }

    #[test]
    fn hold_reason_depends_on_source() {
        assert_eq!(hold_reason(true), "paused (pipeline held by admin)");
        assert_eq!(hold_reason(false), "playback active, pausing (playback has priority)");
    }

    #[test]
    fn fmt_dur_boundaries() {
        // Exact one-second and one-minute boundaries flip units.
        assert_eq!(fmt_dur(Duration::from_secs(1)), "1.0 s");
        assert_eq!(fmt_dur(Duration::from_secs(60)), "1 min 00 s");
        assert_eq!(fmt_dur(Duration::from_secs(3600)), "1 h 00 min");
    }

    fn test_pool() -> TempPool {
        crate::db::testing::temp_pool("disp-test")
    }

    #[test]
    fn pending_count_sums_pending_and_running() {
        let pool = test_pool();
        // An empty ledger for a stage counts zero.
        assert_eq!(pending_count(&pool, "probe").unwrap(), 0);
        // Freshly-enqueued tasks are pending, so they are counted.
        db::pipeline::enqueue(&pool, "probe", "file", "f1", 100, now_ms()).unwrap();
        db::pipeline::enqueue(&pool, "probe", "file", "f2", 100, now_ms()).unwrap();
        assert_eq!(pending_count(&pool, "probe").unwrap(), 2);
        // A different stage's queue is independent.
        assert_eq!(pending_count(&pool, "metadata").unwrap(), 0);
    }

    // Driven with a trivial in-memory Stage so no ffmpeg/enumerate work runs; the
    // infinite `run`/`drain_loop` are deliberately not exercised here.

    use crate::state::SharedState;
    use crate::test_support;

    fn enum_empty(_s: &SharedState) -> Result<Vec<(String, String)>> {
        Ok(Vec::new())
    }
    fn process_ok(_ctx: &JobContext, _id: &str) -> Result<()> {
        Ok(())
    }
    fn process_fail(_ctx: &JobContext, id: &str) -> Result<()> {
        anyhow::bail!("boom: {id}")
    }
    fn process_panic(_ctx: &JobContext, _id: &str) -> Result<()> {
        panic!("kaboom")
    }
    // A stage with a caller-chosen `process`; everything else is inert.
    fn test_stage(process: fn(&JobContext, &str) -> Result<()>) -> Stage {
        Stage {
            short: "teststage",
            key: "pipeline.teststage",
            subject_kind: "file",
            concurrency: 3,
            pause_for_playback: false,
            enumerate: enum_empty,
            process,
        }
    }

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
    fn wait_while_held_returns_immediately_when_not_held() {
        let state = test_support::test_state();
        let ctx = JobContext::for_test(state);
        let paused = AtomicBool::new(false);
        // Nothing held (no admin pause, playback ignored) -> returns at once and
        // leaves the local CAS flag cleared.
        wait_while_held(&ctx, &paused, false);
        assert!(!paused.load(Ordering::Relaxed));
    }

    fn log_lines(rx: &mut tokio::sync::broadcast::Receiver<crate::infra::events::Envelope>) -> Vec<String> {
        let mut out = Vec::new();
        while let Ok(env) = rx.try_recv() {
            let v: serde_json::Value = serde_json::from_str(env.payload_unrouted()).unwrap();
            if let Some(message) = v["message"].as_str() {
                out.push(message.to_string());
            }
        }
        out
    }

    #[test]
    fn a_progress_line_waits_out_the_throttle_and_admits_when_it_cannot_guess() {
        let state = test_support::test_state();
        let ctx = JobContext::for_test(state.clone());
        let mut rx = state.events.subscribe();
        let started = Instant::now();

        let mut last = now_ms();
        maybe_log_progress(&ctx, "teststage", 5, 10, 0, started, &mut last);
        assert!(log_lines(&mut rx).is_empty(), "a line inside the window is skipped");

        let mut last = now_ms() - LOG_EVERY_MS;
        maybe_log_progress(&ctx, "teststage", 0, 10, 0, started, &mut last);
        let lines = log_lines(&mut rx);
        assert_eq!(lines.len(), 1);
        assert!(lines[0].contains("0/10, 0 failed"), "{}", lines[0]);
        assert!(lines[0].contains("~? left"), "nothing done yet, so no rate: {}", lines[0]);
        assert!(now_ms() - last < LOG_EVERY_MS, "the throttle re-armed");

        let mut last = now_ms() - LOG_EVERY_MS;
        maybe_log_progress(&ctx, "teststage", 4, 10, 1, started, &mut last);
        let lines = log_lines(&mut rx);
        assert!(lines[0].contains("4/10, 1 failed"), "{}", lines[0]);
        assert!(!lines[0].contains("~? left"), "a rate is known now: {}", lines[0]);
    }

    #[test]
    fn stage_stats_are_pushed_at_most_once_a_second() {
        let state = test_support::test_state();
        let ctx = JobContext::for_test(state.clone());
        let stage = test_stage(process_ok);
        let mut rx = state.events.subscribe();

        let mut last = now_ms();
        maybe_emit_stats(&stage, &ctx, &mut last);
        assert!(rx.try_recv().is_err(), "the count query is a round-trip; don't repeat it");

        let mut last = now_ms() - 1000;
        maybe_emit_stats(&stage, &ctx, &mut last);
        assert!(rx.try_recv().is_ok());
    }

    #[test]
    fn a_stage_with_nothing_in_scope_clears_its_ledger_instead_of_draining() {
        let state = test_state();
        test_support::seed_task(&state, "teststage", "file", "vanished", "pending", None);
        run(&test_stage(process_ok), &JobContext::for_test(state.clone())).unwrap();

        let left: i64 = state
            .db
            .get()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM pipeline_tasks WHERE stage='teststage'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(left, 0);
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

    #[test]
    fn a_drain_parks_on_the_admin_hold_and_picks_up_where_it_left_off() {
        let state = test_state();
        let ctx = JobContext::for_test(state.clone());
        let mut rx = state.events.subscribe();
        state.jobs.set_pipeline_paused(true);

        let resume = state.clone();
        std::thread::spawn(move || {
            thread::sleep(Duration::from_millis(200));
            resume.jobs.set_pipeline_paused(false);
        });

        drain_loop(&test_stage(process_ok), &ctx, 1).unwrap();
        assert_eq!(
            log_lines(&mut rx),
            vec![
                "teststage: paused (pipeline held by admin)".to_string(),
                "teststage: resumed".to_string(),
            ]
        );
    }

    #[test]
    fn a_drain_cancelled_while_parked_stops_rather_than_waiting_for_the_hold() {
        use crate::services::jobs::RunHandle;
        let state = test_state();
        let handle = std::sync::Arc::new(RunHandle::new("r".into(), "k".into()));
        let ctx = JobContext::from_handle(state.clone(), handle.clone());
        let mut rx = state.events.subscribe();
        state.jobs.set_pipeline_paused(true);

        let cancel_after = std::sync::Arc::clone(&handle);
        std::thread::spawn(move || {
            thread::sleep(Duration::from_millis(200));
            cancel_after.request_cancel();
        });

        drain_loop(&test_stage(process_ok), &ctx, 1).unwrap();
        assert_eq!(
            log_lines(&mut rx),
            vec![
                "teststage: paused (pipeline held by admin)".to_string(),
                "teststage: cancelled while paused".to_string(),
            ]
        );
    }

    #[test]
    fn wait_while_held_exits_on_cancel_even_while_paused() {
        use crate::services::jobs::RunHandle;
        let state = test_support::test_state();
        let handle = std::sync::Arc::new(RunHandle::new("r".into(), "k".into()));
        let ctx = JobContext::from_handle(state.clone(), handle.clone());
        // Hold the whole pipeline, then request cancel: the cancel check wins, so
        // the call returns instead of parking forever on the paused poll loop.
        state.jobs.set_pipeline_paused(true);
        handle.request_cancel();
        let paused = AtomicBool::new(false);
        wait_while_held(&ctx, &paused, false); // must not hang
    }

    #[test]
    fn emit_stats_publishes_stage_counts_from_the_ledger() {
        let state = test_support::test_state();
        let ctx = JobContext::for_test(state.clone());
        // One pending + one failed ledger task for the stage.
        db::pipeline::enqueue(&state.db, "teststage", "file", "a", 0, now_ms()).unwrap();
        test_support::seed_task(&state, "teststage", "file", "b", "failed", Some("x"));
        // Subscribe first: publish is a no-op with zero subscribers.
        let mut rx = state.events.subscribe();
        emit_stats(&test_stage(process_ok), &ctx);
        let env = rx.try_recv().expect("pipeline.stats event published");
        let msg = env.payload_unrouted();
        assert!(msg.contains("pipeline.stats"), "event type: {msg}");
        assert!(msg.contains("teststage"));
        // The event carries the ledger's counts (camelCase single words unchanged).
        assert!(msg.contains("\"pending\":1"), "counts: {msg}");
        assert!(msg.contains("\"failed\":1"), "counts: {msg}");
    }

    use crate::test_support::test_state;

    // Subjects the synthetic stage reports, and the ids it was asked to
    // process. Statics because `Stage` holds plain `fn` pointers, not closures.
    static SUBJECTS: std::sync::Mutex<Vec<(String, String)>> = std::sync::Mutex::new(Vec::new());
    static PROCESSED: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());
    static FAIL_ON: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);
    // One drain at a time: the statics above are shared state.
    static SERIAL: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn enumerate_static(_state: &SharedState) -> Result<Vec<(String, String)>> {
        Ok(SUBJECTS.lock().unwrap().clone())
    }

    fn process_static(_ctx: &JobContext, id: &str) -> Result<()> {
        PROCESSED.lock().unwrap().push(id.to_string());
        if FAIL_ON.lock().unwrap().as_deref() == Some(id) {
            anyhow::bail!("this one always fails");
        }
        Ok(())
    }

    const TEST_STAGE: Stage = Stage {
        short: "testing",
        key: "pipeline.testing",
        subject_kind: "item",
        concurrency: 1,
        pause_for_playback: false,
        enumerate: enumerate_static,
        process: process_static,
    };

    // Set the subject set, drain once, and return the ids that were processed.
    fn drain(state: &SharedState, subjects: &[(&str, &str)]) -> Vec<String> {
        *SUBJECTS.lock().unwrap() =
            subjects.iter().map(|(id, sig)| (id.to_string(), sig.to_string())).collect();
        PROCESSED.lock().unwrap().clear();
        run(&TEST_STAGE, &JobContext::for_test(state.clone())).unwrap();
        let mut done = PROCESSED.lock().unwrap().clone();
        done.sort();
        done
    }

    fn status_of(state: &SharedState, id: &str) -> Option<String> {
        state
            .db
            .get()
            .unwrap()
            .query_row(
                "SELECT status FROM pipeline_tasks WHERE stage='testing' AND subject_id=?1",
                [id],
                |r| r.get(0),
            )
            .ok()
    }

    #[test]
    fn a_drain_processes_every_subject_once_and_then_stops() {
        let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        let state = test_state();
        *FAIL_ON.lock().unwrap() = None;

        assert_eq!(drain(&state, &[("a", "v1"), ("b", "v1")]), ["a", "b"]);
        // A second drain with the same signatures has nothing to do - that is
        // what makes the pipeline cheap to re-run on a schedule.
        assert!(drain(&state, &[("a", "v1"), ("b", "v1")]).is_empty());
        // A changed signature re-queues only that subject.
        assert_eq!(drain(&state, &[("a", "v2"), ("b", "v1")]), ["a"]);
    }

    #[test]
    fn a_task_left_running_by_a_dead_drain_is_reclaimed() {
        // One-run-per-key means a `running` row here was stranded by a drain that
        // died mid-batch; `reconcile` never touches those, so without this reclaim
        // the subject would silently never reprocess.
        let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        let state = test_state();
        *FAIL_ON.lock().unwrap() = None;

        crate::test_support::seed_task(&state, "testing", "item", "stranded", "running", None);
        assert_eq!(status_of(&state, "stranded").as_deref(), Some("running"));

        assert_eq!(drain(&state, &[("stranded", "v1")]), ["stranded"]);
        assert_eq!(status_of(&state, "stranded").as_deref(), Some("done"));
    }

    #[test]
    fn a_subject_that_left_the_set_is_dropped_from_the_ledger() {
        // Otherwise a deleted title's task sits pending forever and every drain
        // re-attempts a subject that no longer exists.
        let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        let state = test_state();
        *FAIL_ON.lock().unwrap() = None;

        drain(&state, &[("a", "v1"), ("gone", "v1")]);
        assert!(status_of(&state, "gone").is_some());

        drain(&state, &[("a", "v1")]);
        assert_eq!(status_of(&state, "gone"), None, "the vanished subject was left behind");
    }

    #[test]
    fn a_failing_subject_is_recorded_and_does_not_stop_the_others() {
        // One bad file must not abandon the rest of the batch, and the failure
        // has to be visible in the ledger rather than just retried forever.
        let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        let state = test_state();
        *FAIL_ON.lock().unwrap() = Some("bad".to_string());

        let done = drain(&state, &[("good", "v1"), ("bad", "v1")]);
        assert_eq!(done, ["bad", "good"], "both were attempted");
        assert_eq!(status_of(&state, "good").as_deref(), Some("done"));
        assert_ne!(status_of(&state, "bad").as_deref(), Some("done"));
        *FAIL_ON.lock().unwrap() = None;
    }

    #[test]
    fn a_cancelled_drain_stops_claiming() {
        let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        let state = test_state();
        *FAIL_ON.lock().unwrap() = None;
        *SUBJECTS.lock().unwrap() =
            (0..5).map(|n| (format!("s{n}"), "v1".to_string())).collect();
        PROCESSED.lock().unwrap().clear();

        let handle = std::sync::Arc::new(crate::services::jobs::RunHandle::new(
            "t".into(),
            "pipeline.testing".into(),
        ));
        handle.request_cancel();
        run(&TEST_STAGE, &JobContext::from_handle(state, handle)).unwrap();

        assert!(PROCESSED.lock().unwrap().is_empty(), "cancelled before the first claim");
    }

    #[test]
    fn a_ledger_that_is_gone_is_reported_rather_than_drained_blind() {
        let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        let state = test_support::test_state();
        *SUBJECTS.lock().unwrap() = vec![("m1".to_string(), "sig".to_string())];
        state.db.get().unwrap().execute_batch("DROP TABLE pipeline_tasks").unwrap();

        assert!(run(&TEST_STAGE, &JobContext::for_test(state)).is_err());
    }

    #[test]
    fn a_batch_whose_result_cannot_be_recorded_still_releases_what_it_claimed() {
        let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        let state = test_support::test_state();
        *SUBJECTS.lock().unwrap() = vec![("m1".to_string(), "sig".to_string())];
        PROCESSED.lock().unwrap().clear();
        state
            .db
            .get()
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER no_release BEFORE UPDATE ON pipeline_tasks \
                 WHEN OLD.status = 'running' BEGIN SELECT RAISE(ABORT, 'refused'); END",
            )
            .unwrap();

        assert!(run(&TEST_STAGE, &JobContext::for_test(state)).is_err());
        assert_eq!(PROCESSED.lock().unwrap().as_slice(), ["m1"], "the work itself was attempted");
    }
}
