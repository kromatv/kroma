use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};

use super::super::run::jobs_after_scan;
use super::super::{enrich_one, maybe_spawn, run_tracked};
use super::support::*;
use crate::test_support::{test_state, test_state_enriching};

#[test]
fn enrich_one_writes_the_movie_the_search_found() {
    let _tmdb = tmdb();
    let state = state_with_movie();

    enrich_one(&state, MOVIE_ID, false).unwrap();

    assert_eq!(tmdb_id_of_movie(&state), Some(MOVIE_TMDB));
}

#[test]
fn enrich_one_writes_the_show_and_its_episode_text() {
    let _tmdb = tmdb();
    let state = state_with_show();

    enrich_one(&state, SHOW_ID, true).unwrap();

    assert_eq!(tmdb_id_of_show(&state), Some(SHOW_TMDB));
    let detail = crate::db::get_show(&state.db, SHOW_ID).unwrap().unwrap();
    let episode = &detail.seasons[0].episodes[0];
    assert_eq!(
        episode
            .metadata
            .as_ref()
            .and_then(|m| m.overview.as_deref()),
        Some("It begins.")
    );
}

#[test]
fn enrich_one_stores_the_season_cast_and_the_episode_guide() {
    let _tmdb = tmdb();
    let state = state_with_show();

    enrich_one(&state, SHOW_ID, true).unwrap();

    let casts = crate::db::season_casts(&state.db, SHOW_ID).unwrap();
    assert_eq!(casts[&1][0].name, "Bryan");
    assert!(!crate::db::episode_guide_stale(&state.db, SHOW_ID, 1).unwrap());
}

#[test]
fn enrich_one_on_a_title_tmdb_does_not_know_is_not_an_error() {
    let _tmdb = tmdb_with_nothing_found();
    let state = state_with_movie();

    let result = enrich_one(&state, MOVIE_ID, false);

    assert!(result.is_ok());
    assert_eq!(tmdb_id_of_movie(&state), None);
}

#[test]
fn enrich_one_on_an_unknown_id_does_nothing() {
    let _tmdb = tmdb();
    let state = state();

    assert!(enrich_one(&state, "ghost", false).is_ok());
    assert!(enrich_one(&state, "ghost", true).is_ok());
}

#[test]
fn enrich_one_without_a_key_does_nothing() {
    let state = test_state();

    assert!(enrich_one(&state, MOVIE_ID, false).is_ok());
}

#[test]
fn enrich_one_uses_the_operators_pin_over_the_search() {
    let _tmdb = tmdb();
    let state = state_with_movie();
    crate::db::tmdb_pin::set(
        &state.db,
        crate::db::metadata_core::ITEM,
        MOVIE_ID,
        MOVIE_TMDB,
    )
    .unwrap();

    enrich_one(&state, MOVIE_ID, false).unwrap();

    assert_eq!(tmdb_id_of_movie(&state), Some(MOVIE_TMDB));
}

#[test]
fn enrich_one_renames_a_pinned_movie_to_the_title_tmdb_gives() {
    let _tmdb = tmdb();
    let state = state_with_movie();
    state
        .db
        .get()
        .unwrap()
        .execute("UPDATE items SET title = 'wrong' WHERE id = 'm1'", [])
        .unwrap();
    crate::db::tmdb_pin::set(
        &state.db,
        crate::db::metadata_core::ITEM,
        MOVIE_ID,
        MOVIE_TMDB,
    )
    .unwrap();

    enrich_one(&state, MOVIE_ID, false).unwrap();

    let item = crate::db::get_item(&state.db, MOVIE_ID).unwrap().unwrap();
    assert_eq!(item.title, "Title m1");
}

#[test]
fn enrich_one_renames_a_pinned_show() {
    let _tmdb = tmdb();
    let state = state_with_show();
    state
        .db
        .get()
        .unwrap()
        .execute("UPDATE shows SET title = 'wrong' WHERE id = 's1'", [])
        .unwrap();
    crate::db::tmdb_pin::set(
        &state.db,
        crate::db::metadata_core::SHOW,
        SHOW_ID,
        SHOW_TMDB,
    )
    .unwrap();

    enrich_one(&state, SHOW_ID, true).unwrap();

    let show = crate::db::get_show(&state.db, SHOW_ID)
        .unwrap()
        .unwrap()
        .show;
    assert_eq!(show.title, "Show s1");
}

#[test]
fn run_tracked_enriches_the_whole_catalog_and_reports_progress() {
    let _tmdb = shared_tmdb();
    let state = state_with_movie();
    crate::test_support::seed_show_episode(&state, SHOW_ID, EPISODE_ID);
    let (items, shows) = catalog(&state);

    let summary = run_tracked(&state, &items, &shows, |_, _| (), || false);

    assert_eq!(summary.total, 2);
    assert_eq!(summary.resolved, 2);
    assert_eq!(summary.missed, 0);
    assert_eq!(summary.failed, 0);
    assert!(!summary.cancelled);
    assert_eq!(tmdb_id_of_movie(&state), Some(MOVIE_TMDB));
    assert_eq!(tmdb_id_of_show(&state), Some(SHOW_TMDB));
}

#[test]
fn run_tracked_counts_a_title_tmdb_cannot_find_as_missed() {
    let _tmdb = shared_tmdb_with_nothing_found();
    let state = state_with_movie();
    let (items, shows) = catalog(&state);

    let summary = run_tracked(&state, &items, &shows, |_, _| (), || false);

    assert_eq!(summary.missed, 1);
    assert_eq!(summary.resolved, 0);
}

#[test]
fn run_tracked_stops_when_asked_to_cancel() {
    let _tmdb = shared_tmdb();
    let state = state_with_movie();
    let (items, shows) = catalog(&state);
    let asked = AtomicBool::new(false);

    let summary = run_tracked(
        &state,
        &items,
        &shows,
        |_, _| (),
        || {
            asked.store(true, Ordering::Relaxed);
            true
        },
    );

    assert!(asked.load(Ordering::Relaxed));
    assert!(summary.cancelled);
}

#[test]
fn run_tracked_with_no_key_reports_the_total_and_nothing_done() {
    let state = test_state();
    crate::test_support::seed_movie(&state, MOVIE_ID);
    let (items, shows) = catalog(&state);

    let summary = run_tracked(&state, &items, &shows, |_, _| (), || false);

    assert_eq!(summary.total, 1);
    assert_eq!(summary.resolved, 0);
}

#[test]
fn run_tracked_over_an_empty_catalog_has_nothing_to_do() {
    let state = state();

    let summary = run_tracked(&state, &[], &[], |_, _| (), || false);

    assert_eq!(summary.total, 0);
    assert!(!summary.cancelled);
}

#[test]
fn maybe_spawn_enriches_in_the_background_and_announces_completion() {
    let _tmdb = shared_tmdb();
    let state = test_state_enriching("key");
    crate::test_support::seed_movie(&state, MOVIE_ID);
    let mut events = state.events.subscribe();

    maybe_spawn(&state, &HashSet::new());

    loop {
        let event = events.blocking_recv().unwrap();
        if event
            .payload_for("anyone")
            .is_some_and(|p| p.contains("enrich.completed"))
        {
            break;
        }
    }
    assert_eq!(tmdb_id_of_movie(&state), Some(MOVIE_TMDB));
}

#[test]
fn maybe_spawn_stays_idle_without_a_key_or_the_toggle() {
    let keyless = test_state();
    let toggled_off = state();
    crate::test_support::seed_movie(&toggled_off, MOVIE_ID);

    maybe_spawn(&keyless, &HashSet::new());
    maybe_spawn(&toggled_off, &HashSet::new());

    assert_eq!(tmdb_id_of_movie(&toggled_off), None);
}

#[test]
fn maybe_spawn_with_an_empty_catalog_does_nothing() {
    let state = test_state_enriching("key");

    maybe_spawn(&state, &HashSet::new());

    assert_eq!(tmdb_id_of_movie(&state), None);
}

#[test]
fn a_scan_that_moved_nothing_leaves_a_matched_catalog_alone() {
    let _tmdb = tmdb();
    let movie = state_with_movie();
    enrich_one(&movie, MOVIE_ID, false).unwrap();
    let show = state_with_show();
    enrich_one(&show, SHOW_ID, true).unwrap();

    let movie_jobs = jobs_after_scan(&movie, &HashSet::new()).unwrap();
    let show_jobs = jobs_after_scan(&show, &HashSet::new()).unwrap();

    assert!(movie_jobs.is_empty());
    assert!(show_jobs.is_empty());
}

#[test]
fn a_scan_hands_tmdb_the_title_it_never_matched() {
    let state = state_with_movie();

    let jobs = jobs_after_scan(&state, &HashSet::new()).unwrap();

    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].id, MOVIE_ID);
    assert_eq!(jobs[0].resolved_tmdb, None);
}

#[test]
fn a_scan_hands_tmdb_the_matched_show_whose_episodes_moved() {
    let _tmdb = tmdb();
    let state = state_with_show();
    enrich_one(&state, SHOW_ID, true).unwrap();
    let moved = HashSet::from([SHOW_ID.to_string()]);

    let jobs = jobs_after_scan(&state, &moved).unwrap();

    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].resolved_tmdb, Some(SHOW_TMDB));
}

#[test]
fn a_pass_runs_at_least_two_workers_and_never_more_than_eight() {
    let workers = super::super::run::workers();

    assert!((2..=8).contains(&workers), "{workers}");
}
