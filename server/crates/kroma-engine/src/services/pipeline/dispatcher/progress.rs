use std::time::{Duration, Instant};

use crate::db;
use crate::infra::events::ServerEvent;
use crate::services::jobs::{now_ms, JobContext};

use super::super::stage::Stage;

// How often the drain logs a progress line (with elapsed + ETA) during a long
// run, so a multi-minute stage isn't silent between "in scope" and "finished".
const LOG_EVERY_MS: i64 = 10_000;

// Human-readable elapsed time (`820 ms` · `4.3 s` · `2 min 05 s` · `1 h 07 min`).
pub(super) fn fmt_dur(d: Duration) -> String {
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
pub(super) fn maybe_log_progress(
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

// Throttled to ~1/s: the WS event is cheap but the count query is a round-trip.
pub(super) fn maybe_emit_stats(stage: &Stage, ctx: &JobContext, last_ms: &mut i64) {
    let now = now_ms();
    if now - *last_ms < 1000 {
        return;
    }
    *last_ms = now;
    emit_stats(stage, ctx);
}

pub(super) fn emit_stats(stage: &Stage, ctx: &JobContext) {
    if let Ok(stat) =
        db::pipeline::stage_stat(&ctx.state.db, stage.short, stage.key, stage.subject_kind)
    {
        ctx.state.events.publish(ServerEvent::PipelineStats { stages: vec![stat] });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::pipeline::dispatcher::test_support::{log_lines, test_stage, process_ok};
    use crate::test_support;

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
    fn fmt_dur_boundaries() {
        // Exact one-second and one-minute boundaries flip units.
        assert_eq!(fmt_dur(Duration::from_secs(1)), "1.0 s");
        assert_eq!(fmt_dur(Duration::from_secs(60)), "1 min 00 s");
        assert_eq!(fmt_dur(Duration::from_secs(3600)), "1 h 00 min");
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
}
