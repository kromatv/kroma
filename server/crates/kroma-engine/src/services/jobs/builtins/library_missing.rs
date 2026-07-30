//! `library.missing` diffs TMDB's aired episode list against what is on disk for
//! every show with a resolved TMDB id, so the Wanted/Missing view surfaces
//! series with gaps even when they were never requested.

use super::prelude::*;

pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("library.missing"),
    category: Category::Library,
    // After the nightly library scan / enrich, before waking hours.
    schedule: Some("30 4 * * *"),
    triggers: &[],
    run,
};

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    let state = &ctx.state;
    if state.config.tmdb_api_key.is_none() {
        ctx.warn("no TMDB API key configured nothing to scan for missing episodes");
        return Ok(());
    }
    let summary = crate::services::library_missing::scan(
        state,
        &|done, total| ctx.progress(done, total),
        &|| ctx.cancelled(),
    )?;
    ctx.info(format!(
        "scanned {} shows, {} with missing episodes ({} aired episodes not on disk)",
        summary.shows, summary.with_gaps, summary.episodes
    ));
    Ok(())
}
