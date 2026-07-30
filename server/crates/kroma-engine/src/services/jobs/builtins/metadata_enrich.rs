//! `metadata.enrich` re-resolves TMDB metadata (posters, overviews, embeddings)
//! for the whole catalog, to completion within the run so progress is tracked.

use super::prelude::*;

pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("metadata.enrich"),
    category: Category::Library,
    schedule: None,
    triggers: &[],
    run,
};

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    let state = &ctx.state;
    if state.config.tmdb_api_key.is_none() {
        ctx.warn("no TMDB API key configured nothing to enrich");
        return Ok(());
    }
    let items = crate::db::list_items(&state.db, None)?;
    let shows = crate::db::list_shows(&state.db, None)?;
    let titles =
        items.iter().filter(|i| !matches!(i.kind, crate::model::Kind::Episode)).count();
    ctx.info(format!("re-enriching {titles} movies/videos and {} shows from TMDB…", shows.len()));

    let summary = crate::services::enrich::run_tracked(
        state,
        &items,
        &shows,
        |done, total| ctx.progress(done, total),
        || ctx.cancelled(),
    );

    let done = summary.resolved + summary.missed + summary.failed;
    if summary.cancelled {
        ctx.warn(format!(
            "cancelled after {done}/{} titles {} enriched, {} without a match, {} failed",
            summary.total, summary.resolved, summary.missed, summary.failed
        ));
        return Ok(());
    }
    ctx.info(format!(
        "enriched {} titles, {} without a TMDB match, {} failed (of {})",
        summary.resolved, summary.missed, summary.failed, summary.total
    ));

    // Freshly-resolved cast / overview / localized titles only become searchable
    // after a reindex.
    ctx.info("rebuilding search index…");
    match state.search.reindex_from_db(&state.db) {
        Ok(()) => ctx.info("search index rebuilt"),
        Err(e) => ctx.error(format!("search reindex failed: {e:#}")),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::run;
    use crate::services::jobs::{JobContext, RunHandle};
    use crate::state::SharedState;
    use crate::test_support::{seed_movie, test_state, test_state_with_tmdb, FakeTmdb};

    fn empty_page() -> serde_json::Value {
        serde_json::json!({ "page": 1, "total_pages": 1, "results": [] })
    }

    fn log_lines(state: &SharedState, run_id: &str) -> Vec<String> {
        let conn = state.db.get().unwrap();
        let mut stmt = conn
            .prepare("SELECT level || ': ' || message FROM job_logs WHERE run_id = ?1 ORDER BY ts")
            .unwrap();
        let rows = stmt.query_map([run_id], |r| r.get::<_, String>(0)).unwrap();
        rows.map(|r| r.unwrap()).collect()
    }

    fn run_with(state: &SharedState, cancelled: bool) -> Vec<String> {
        let handle = std::sync::Arc::new(RunHandle::new("run-1".into(), "metadata.enrich".into()));
        if cancelled {
            handle.request_cancel();
        }
        run(&JobContext::from_handle(state.clone(), handle)).unwrap();
        log_lines(state, "run-1")
    }

    #[test]
    fn without_a_tmdb_key_the_job_says_so_and_does_nothing_else() {
        let state = test_state();
        seed_movie(&state, "itm-1");

        let lines = run_with(&state, false);
        assert_eq!(lines.len(), 1, "{lines:?}");
        assert!(lines[0].starts_with("warn: "), "{lines:?}");
        assert!(lines[0].contains("TMDB"), "{lines:?}");
        assert!(!lines.iter().any(|l| l.contains("index")), "{lines:?}");
    }

    #[test]
    fn a_finished_pass_reports_its_counts_and_rebuilds_the_index() {
        let state = test_state_with_tmdb("test-key");
        seed_movie(&state, "itm-1");
        let _tmdb = FakeTmdb::start(|_| (200, empty_page()));

        let lines = run_with(&state, false);
        let joined = lines.join("\n");
        assert!(joined.contains("re-enriching"), "{joined}");
        assert!(joined.contains("without a TMDB match"), "the counts were not reported: {joined}");
        assert!(joined.contains("search index rebuilt"), "{joined}");
    }

    #[test]
    fn a_cancelled_pass_stops_before_the_reindex() {
        let state = test_state_with_tmdb("test-key");
        seed_movie(&state, "itm-1");
        let _tmdb = FakeTmdb::start(|_| (200, empty_page()));

        let lines = run_with(&state, true);
        let joined = lines.join("\n");
        assert!(joined.contains("cancelled after"), "{joined}");
        assert!(!joined.contains("rebuilding search index"), "reindexed anyway: {joined}");
    }

    #[test]
    fn an_empty_catalogue_still_reports_and_reindexes() {
        let state = test_state_with_tmdb("test-key");
        let _tmdb = FakeTmdb::start(|_| (200, empty_page()));
        let joined = run_with(&state, false).join("\n");
        assert!(joined.contains("0 shows") || joined.contains("re-enriching 0"), "{joined}");
        assert!(joined.contains("search index rebuilt"), "{joined}");
    }
}
