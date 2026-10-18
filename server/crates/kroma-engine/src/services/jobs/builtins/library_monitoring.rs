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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{test_state, test_state_with_tmdb};

    fn seed_vanished_films(state: &crate::state::SharedState, count: u64) {
        let rows: Vec<crate::db::WantedRow> = (0..count)
            .map(|n| crate::db::WantedRow {
                id: format!("m{n}"),
                request_id: None,
                kind: "movie".into(),
                tmdb_id: 1000 + n,
                imdb_id: None,
                title: "M".into(),
                year: None,
                season: None,
                episode: None,
                air_date: None,
                status: "available".into(),
                last_search_at: None,
            })
            .collect();
        crate::db::insert_wanted(&state.db, &rows, 0).unwrap();
        let conn = state.db.get().unwrap();
        for n in 0..count {
            conn.execute(
                "INSERT INTO monitored (kind,tmdb_id,title,added_at,updated_at) VALUES ('movie',?1,'M',0,0)",
                [(1000 + n) as i64],
            )
            .unwrap();
        }
    }

    #[test]
    fn a_run_without_a_tmdb_key_still_reconciles_the_disk() {
        let state = test_state();
        let ctx = JobContext::for_test(state);

        run(&ctx).unwrap();
    }

    #[test]
    fn a_run_with_a_tmdb_key_and_nothing_monitored_succeeds() {
        let state = test_state_with_tmdb("k");
        let ctx = JobContext::for_test(state);

        run(&ctx).unwrap();
    }

    #[test]
    fn a_run_that_holds_back_many_vanished_files_still_succeeds() {
        let state = test_state();
        seed_vanished_films(&state, 30);
        let ctx = JobContext::for_test(state.clone());

        run(&ctx).unwrap();

        let conn = state.db.get().unwrap();
        let available: i64 = conn
            .query_row("SELECT COUNT(*) FROM wanted WHERE status = 'available'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(available, 30);
    }
}
