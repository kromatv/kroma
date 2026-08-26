//! `stats.report` send this install's anonymous heartbeat, if it was asked to.
//!
//! The scheduling shell only: what is in the payload, and what is kept out of
//! it, lives in `services::stats`. The run log prints the exact bytes that left
//! the box, so an operator can check the claim rather than take it.

use super::prelude::*;

use crate::services::stats::{self, Report};

pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("stats.report"),
    category: Category::Maintenance,
    // Once a day, off the hour: every install would otherwise wake at the same
    // minute in the same time zone and arrive as one spike.
    schedule: Some("37 5 * * *"),
    triggers: &[],
    run,
};

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    match stats::run(&ctx.state)? {
        Report::Off => ctx.info("anonymous statistics are off; nothing was sent"),
        Report::Deferred(status) => ctx.info(format!(
            "the statistics endpoint answered {status}; the next run is the retry"
        )),
        Report::Sent(payload) => ctx.info(format!(
            "sent: {}",
            serde_json::to_string(&payload).unwrap_or_default()
        )),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::test_state;

    #[test]
    fn a_run_on_an_install_that_never_opted_in_succeeds_and_sends_nothing() {
        let state = test_state();
        let ctx = JobContext::for_test(state.clone());

        run(&ctx).unwrap();

        assert_eq!(state.settings.get_str(stats::ID_KEY, ""), "");
        assert_eq!(state.settings.get_str(stats::SENT_KEY, ""), "");
    }
}
