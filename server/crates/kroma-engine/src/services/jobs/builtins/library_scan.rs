//! `library.scan` full library rescan (phase 1) + sync, then kick phase-2
//! probing, search reindex and TMDB enrichment the same pipeline as `POST
//! /api/scan`, shared via `services::scan`.

use super::prelude::*;
use crate::services::scan::{Scanned, WalkTurn};

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
    let turn = WalkTurn::wait();
    let cancelled = || ctx.cancelled();
    let data = match crate::services::scan::scan_and_publish(&turn, state, &cancelled)? {
        Scanned::Applied(data) => data,
        Scanned::MountOffline { dropped } => {
            ctx.info(kept_on_an_outage(dropped));
            return Ok(());
        }
        Scanned::Cancelled { dropped } => {
            ctx.info(kept_on_a_cancel(dropped));
            return Ok(());
        }
    };
    ctx.info(format!(
        "scan complete {} libraries, {} shows, {} items",
        data.libraries.len(),
        data.shows.len(),
        data.items.len()
    ));

    if ctx.cancelled() {
        crate::services::scan::hold_changed_shows(state, &data)?;
        return Ok(());
    }
    crate::services::scan::spawn_follow_ups(state, &data);
    ctx.info("dispatched probing, search reindex and TMDB enrichment");
    Ok(())
}

fn kept_on_an_outage(dropped: usize) -> String {
    if dropped == 0 {
        return "libraries produced no items; kept the stored index (mount offline?)".into();
    }
    removed_first(
        "libraries produced no items; kept their stored titles (mount offline?)",
        dropped,
    )
}

fn kept_on_a_cancel(dropped: usize) -> String {
    let kept = "scan cancelled; kept the titles it had written and pruned none";
    if dropped == 0 {
        return kept.into();
    }
    removed_first(kept, dropped)
}

fn removed_first(kept: &str, dropped: usize) -> String {
    format!("{kept}. Removed first, because they left the configuration: {dropped}")
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

    fn library(id: &str, root: &std::path::Path) -> crate::services::settings::LibraryDef {
        crate::services::settings::LibraryDef {
            id: id.into(),
            name: "Films".into(),
            kind: "movies".into(),
            folders: vec![root.to_string_lossy().into_owned()],
            auto_scan: true,
        }
    }

    fn library_at(state: &crate::state::SharedState, root: &std::path::Path) {
        crate::services::settings::set_library_defs(
            &state.settings,
            &state.db,
            &[library("lib-1", root)],
        );
    }

    #[test]
    fn a_scan_cancelled_during_the_walk_keeps_what_it_wrote_and_dispatches_no_follow_ups() {
        let state = test_state();
        let root = kroma_testing::temp_dir("job-scan-cancelled");
        std::fs::write(root.path().join("Heat (1995).mkv"), b"x").unwrap();
        library_at(&state, root.path());
        let handle = Arc::new(RunHandle::new("run-2".into(), "library.scan".into()));
        handle.request_cancel();

        run(&JobContext::from_handle(state.clone(), handle)).unwrap();

        let lines = log_lines(&state, "run-2");
        assert!(
            lines.iter().any(|l| l.starts_with("scan cancelled")),
            "{lines:?}"
        );
        assert!(!lines.iter().any(|l| l.contains("dispatched")), "{lines:?}");
        assert_eq!(crate::db::counts(&state.db).unwrap(), (1, 1, 0));
    }

    #[test]
    fn a_scan_of_a_library_that_reads_empty_says_it_kept_the_stored_index() {
        let state = test_state();
        let root = kroma_testing::temp_dir("job-scan-offline");
        library_at(&state, root.path());

        run(&JobContext::for_test(state.clone())).unwrap();

        let lines = log_lines(&state, "test-run");
        assert!(
            lines.iter().any(|l| l.contains("kept the stored index")),
            "{lines:?}"
        );
    }

    #[test]
    fn a_scan_that_removed_a_library_before_it_read_empty_does_not_say_it_kept_the_index() {
        let state = test_state();
        let kept = kroma_testing::temp_dir("job-scan-kept");
        let gone = kroma_testing::temp_dir("job-scan-gone");
        std::fs::write(kept.path().join("Heat (1995).mkv"), b"x").unwrap();
        std::fs::write(gone.path().join("Ran (1985).mkv"), b"x").unwrap();
        crate::services::settings::set_library_defs(
            &state.settings,
            &state.db,
            &[
                library("lib-1", kept.path()),
                library("lib-gone", gone.path()),
            ],
        );
        crate::services::scan::rescan_sync(
            &crate::services::scan::WalkTurn::wait(),
            &state,
            &mut crate::services::scan::uninterrupted,
        )
        .unwrap();
        std::fs::remove_file(kept.path().join("Heat (1995).mkv")).unwrap();
        library_at(&state, kept.path());

        run(&JobContext::for_test(state.clone())).unwrap();

        let lines = log_lines(&state, "test-run");
        assert!(
            lines
                .iter()
                .any(|l| l.contains("because they left the configuration: 1")),
            "{lines:?}"
        );
        assert!(
            !lines.iter().any(|l| l.contains("kept the stored index")),
            "{lines:?}"
        );
        assert_eq!(crate::db::counts(&state.db).unwrap(), (1, 1, 0));
    }

    #[test]
    fn a_scan_cancelled_after_it_removed_a_library_says_how_many_it_removed() {
        let state = test_state();
        let kept = kroma_testing::temp_dir("job-cancel-kept");
        let gone = kroma_testing::temp_dir("job-cancel-gone");
        std::fs::write(kept.path().join("Heat (1995).mkv"), b"x").unwrap();
        std::fs::write(gone.path().join("Ran (1985).mkv"), b"x").unwrap();
        crate::services::settings::set_library_defs(
            &state.settings,
            &state.db,
            &[
                library("lib-1", kept.path()),
                library("lib-gone", gone.path()),
            ],
        );
        crate::services::scan::rescan_sync(
            &crate::services::scan::WalkTurn::wait(),
            &state,
            &mut crate::services::scan::uninterrupted,
        )
        .unwrap();
        library_at(&state, kept.path());
        let handle = Arc::new(RunHandle::new("run-5".into(), "library.scan".into()));
        handle.request_cancel();

        run(&JobContext::from_handle(state.clone(), handle)).unwrap();

        let lines = log_lines(&state, "run-5");
        assert_eq!(crate::db::counts(&state.db).unwrap(), (1, 1, 0));
        assert!(
            lines
                .iter()
                .any(|l| l.to_lowercase().contains("removed") && l.contains('1')),
            "{lines:?}"
        );
    }

    #[test]
    fn a_scan_that_meets_a_saved_list_it_cannot_read_fails_and_says_so() {
        let state = test_state();
        let unreadable = serde_json::json!([{ "name": "Films" }]);
        crate::db::settings_set(&state.db, "libraries", &unreadable).unwrap();
        state.settings.reload(&state.db);

        let failed = run(&JobContext::for_test(state.clone()));

        let message = failed.unwrap_err().to_string();
        assert!(message.contains("cannot read"), "{message}");
        let lines = log_lines(&state, "test-run");
        assert!(
            !lines.iter().any(|l| l.contains("kept the stored index")),
            "{lines:?}"
        );
        assert_eq!(crate::db::counts(&state.db).unwrap(), (0, 0, 0));
    }

    #[test]
    fn a_scan_cancelled_after_the_walk_keeps_its_changed_shows_for_the_next_scan() {
        let state = test_state();
        let handle = Arc::new(RunHandle::new("run-4".into(), "library.scan".into()));
        handle.request_cancel();

        run(&JobContext::from_handle(state.clone(), handle)).unwrap();
        let held = crate::db::unsettled_shows(&state.db).unwrap();
        let next = crate::services::scan::rescan_sync(
            &crate::services::scan::WalkTurn::wait(),
            &state,
            &mut crate::services::scan::uninterrupted,
        )
        .unwrap();

        assert!(!held.is_empty());
        assert!(matches!(next, Scanned::Applied(data) if data.changed_shows == held));
        assert!(crate::db::unsettled_shows(&state.db).unwrap().is_empty());
    }
}
