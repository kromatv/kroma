//! `library.monitoring` keeps monitored titles true to TMDB and to the disk:
//! newly announced episodes join, files that landed or vanished move their
//! rows, and the requests they answer to are settled.

use super::prelude::*;

pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("library.monitoring"),
    category: Category::Library,
    schedule: Some("45 */6 * * *"),
    triggers: &[Trigger::AfterJob(JobKey("pipeline.metadata"))],
    run,
};

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    let state = &ctx.state;
    if state.config.tmdb_api_key.is_some() {
        let refreshed = crate::services::monitoring::refresh_pass(state.as_ref())?;
        ctx.info(format!("re-read {refreshed} monitored titles from TMDB"));
    }
    let summary = crate::services::monitoring::reconcile_pass(state.as_ref())?;
    ctx.info(format!(
        "{} monitored titles: {} units now on disk, {} missing again, {} held back",
        summary.titles, summary.available, summary.missing_again, summary.held_back
    ));
    if summary.held_back > 0 {
        ctx.warn(format!(
            "{} monitored files vanished at once; left available in case a source is offline",
            summary.held_back
        ));
    }
    crate::services::requests::availability_pass(state.as_ref())?;
    Ok(())
}
