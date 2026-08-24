//! `library.scan` full library rescan (phase 1) + sync, then kick phase-2
//! probing, search reindex and TMDB enrichment the same pipeline as `POST
//! /api/scan`, shared via `services::scan`.

use super::prelude::*;

// Manual + debounced library-watch: rescan the media folders for changes.
pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("library.scan"),
    category: Category::Library,
    schedule: None,
    triggers: &[Trigger::LibraryChange],
    run,
};

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    let state = &ctx.state;
    ctx.info("scanning libraries (walk + sync)…");
    let crate::services::scan::Scanned::Applied(data) =
        crate::services::scan::scan_and_publish(state)?
    else {
        ctx.info("libraries produced no items; kept the stored index (mount offline?)");
        return Ok(());
    };
    ctx.info(format!(
        "scan complete {} libraries, {} shows, {} items",
        data.libraries.len(),
        data.shows.len(),
        data.items.len()
    ));

    if ctx.cancelled() {
        return Ok(());
    }
    crate::services::scan::spawn_follow_ups(state, &data);
    ctx.info("dispatched probing, search reindex and TMDB enrichment");
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::services::jobs::RunHandle;
    use crate::test_support::test_state;

    fn log_lines(state: &crate::state::SharedState, run_id: &str) -> Vec<String> {
        let conn = state.db.get().unwrap();
        let mut stmt = conn
            .prepare("SELECT message FROM job_logs WHERE run_id = ?1 ORDER BY ts")
            .unwrap();
        let rows = stmt.query_map([run_id], |r| r.get::<_, String>(0)).unwrap();
        rows.map(|r| r.unwrap()).collect()
    }

    #[test]
    fn a_scan_cancelled_after_the_walk_dispatches_no_follow_ups() {
        let state = test_state();
        let handle = Arc::new(RunHandle::new("run-1".into(), "library.scan".into()));
        handle.request_cancel();

        run(&JobContext::from_handle(state.clone(), handle)).unwrap();

        let lines = log_lines(&state, "run-1");
        assert!(
            lines.iter().any(|l| l.starts_with("scan complete")),
            "{lines:?}"
        );
        assert!(!lines.iter().any(|l| l.contains("dispatched")), "{lines:?}");
    }
}
