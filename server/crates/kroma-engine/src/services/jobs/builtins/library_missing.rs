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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{seed_show_episode, test_state, test_state_with_tmdb};

    #[test]
    fn without_a_tmdb_key_there_is_nothing_to_diff_against() {
        let state = test_state();
        seed_show_episode(&state, "s1", "e1");
        run(&JobContext::for_test(state.clone())).unwrap();

        let gaps: i64 = state
            .db
            .get()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM library_gaps", [], |r| r.get(0))
            .unwrap();
        assert_eq!(gaps, 0);
    }

    #[test]
    fn a_show_that_was_never_enriched_is_skipped_rather_than_looked_up() {
        let state = test_state_with_tmdb("key");
        seed_show_episode(&state, "s1", "e1");
        run(&JobContext::for_test(state.clone())).unwrap();

        let gaps: i64 = state
            .db
            .get()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM library_gaps", [], |r| r.get(0))
            .unwrap();
        assert_eq!(gaps, 0, "no TMDB id means no episode list, not an empty one");
    }

    #[test]
    fn a_scan_that_cannot_finish_fails_the_job_rather_than_reporting_a_clean_library() {
        let state = test_state_with_tmdb("key");
        seed_show_episode(&state, "s1", "e1");
        state.db.get().unwrap().execute_batch("DROP TABLE shows").unwrap();

        assert!(run(&JobContext::for_test(state)).is_err());
    }
}
