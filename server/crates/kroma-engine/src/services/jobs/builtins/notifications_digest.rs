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
