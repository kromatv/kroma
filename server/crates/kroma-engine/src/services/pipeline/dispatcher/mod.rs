//! The stage driver. One call to [`run`] does a whole stage-drain: reconcile the
//! ledger against the current catalog, then claim -> process -> record in
//! batches until the queue is empty or the run is cancelled.
//!
//! Runs on the job's blocking thread and owns every `pipeline_tasks` write
//! (batched into one transaction), so workers never contend on SQLite's single writer.

mod hold;
mod progress;
mod workers;

#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;

use std::thread;
use std::time::{Duration, Instant};

use anyhow::Result;

use crate::db;
use crate::services::jobs::{now_ms, JobContext};

use super::stage::Stage;

use progress::{emit_stats, fmt_dur, maybe_emit_stats, maybe_log_progress};
use workers::process_batch;

// Small enough that a cancel is observed promptly; large enough that the
// per-batch DB round-trips are negligible next to the ffmpeg/TMDB work.
const BATCH: usize = 32;
const PAUSE_POLL_S: u64 = 4;

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
        Err(e) => ctx.warn(format!(
            "{}: failed to reclaim stranded tasks: {e:#}",
            stage.short
        )),
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
        ctx.info(format!(
            "{}: nothing to do (already up to date)",
            stage.short
        ));
        return Ok(());
    }
    ctx.info(format!(
        "{}: draining {total} pending task(s)…",
        stage.short
    ));

    let drained = drain_loop(stage, ctx, total);

    // A mid-batch cancel or an aborted loop can leave tasks claimed but
    // unprocessed; reset them to `pending` here regardless of how the loop exited.
    if let Err(e) = db::pipeline::reset_running(pool, Some(stage.short)) {
        ctx.warn(format!(
            "{}: failed to reset leftover running tasks: {e:#}",
            stage.short
        ));
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
        maybe_log_progress(
            ctx,
            stage.short,
            processed,
            total,
            failed_seen,
            drain_started,
            &mut log_flush_ms,
        );
    }
    Ok(())
}

// Pending + still-running tasks after reconcile = the drain's denominator.
fn pending_count(pool: &db::Pool, stage: &str) -> Result<usize> {
    let (pending, running, ..) = db::pipeline::counts(pool, stage)?;
    Ok((pending + running).max(0) as usize)
}
