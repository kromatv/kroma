use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use crate::services::jobs::JobContext;

use super::PAUSE_POLL_S;

// Blocks while the global pipeline pause is set, or (for a playback-sensitive
// stage) a stream is live. Logs the hold/resume transition once per worker.
pub(super) fn wait_while_held(ctx: &JobContext, paused: &AtomicBool, pause_for_playback: bool) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::jobs::JobContext;
    use crate::test_support;

    #[test]
    fn hold_reason_depends_on_source() {
        assert_eq!(hold_reason(true), "paused (pipeline held by admin)");
        assert_eq!(hold_reason(false), "playback active, pausing (playback has priority)");
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
}
