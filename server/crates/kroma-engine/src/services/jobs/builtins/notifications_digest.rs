//! `notifications.digest` tell people what arrived in the library.
//!
//! Runs on a short cycle AND right after the metadata pipeline, so a title is
//! announced with its poster already resolved rather than as a bare filename.
//! The batching (and the "stay quiet on first run" rule) lives in
//! `services::notify::digest`; this is just the scheduling shell.

use super::prelude::*;

pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("notifications.digest"),
    category: Category::Library,
    // Every 15 minutes: new media is not urgent, and a short cycle keeps each
    // digest small enough to name what actually arrived.
    schedule: Some("*/15 * * * *"),
    // Chained after metadata so posters exist by the time we announce.
    triggers: &[Trigger::AfterJob(JobKey("pipeline.metadata"))],
    run,
};

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    let summary = crate::services::notify::digest::run(&ctx.state)?;
    if summary.seeded {
        ctx.info("first run: adopted the current library as the baseline, notified nobody");
        return Ok(());
    }
    if summary.movies == 0 && summary.shows == 0 {
        ctx.info("nothing new since the last digest");
        return Ok(());
    }
    ctx.info(format!(
        "announced {} new title(s) and episodes across {} show(s); {} notification(s) delivered",
        summary.movies, summary.shows, summary.sent
    ));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::notify::digest::WATERMARK_KEY;
    use crate::test_support::{seed_movie, test_state};
    use kroma_module_host::HostCtx as _;

    #[test]
    fn the_first_run_adopts_the_library_instead_of_announcing_all_of_it() {
        let state = test_state();
        seed_movie(&state, "m1");
        let ctx = JobContext::for_test(state.clone());

        run(&ctx).unwrap();
        assert_eq!(state.setting_str(WATERMARK_KEY, ""), "t", "the head became the baseline");

        let inbox: i64 = state
            .db
            .get()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM notifications", [], |r| r.get(0))
            .unwrap();
        assert_eq!(inbox, 0);
    }

    #[test]
    fn a_run_with_nothing_new_leaves_the_watermark_where_it_was() {
        let state = test_state();
        seed_movie(&state, "m1");
        let ctx = JobContext::for_test(state.clone());
        run(&ctx).unwrap();

        run(&ctx).unwrap();
        assert_eq!(state.setting_str(WATERMARK_KEY, ""), "t");
    }

    #[test]
    fn a_title_added_after_the_baseline_advances_the_watermark_past_it() {
        let state = test_state();
        seed_movie(&state, "m1");
        let ctx = JobContext::for_test(state.clone());
        run(&ctx).unwrap();

        seed_movie(&state, "m2");
        state
            .db
            .get()
            .unwrap()
            .execute("UPDATE items SET added_at='u' WHERE id='m2'", [])
            .unwrap();
        run(&ctx).unwrap();
        assert_eq!(state.setting_str(WATERMARK_KEY, ""), "u");
    }
}
