use std::sync::atomic::Ordering;

use super::super::engine::{engine_for, Counters};
use super::super::jobs::Job;
use super::super::process::process_job;
use super::support::*;
use crate::infra::metadata::Target;

fn movie_job(resolved: Option<u64>, refetch: Option<u64>) -> Job {
    Job {
        id: MOVIE_ID.into(),
        target: Target::Movie,
        title: "Title m1".into(),
        year: None,
        is_show: false,
        resolved_tmdb: resolved,
        pin: None,
        refetch,
    }
}

#[test]
fn a_settled_movie_only_fills_the_languages_it_lacks() {
    let tmdb = tmdb();
    let state = state_with_movie();
    let eng = engine_for(&state, "key".into());
    let counters = Counters::default();

    process_job(&eng, &counters, 1, None, movie_job(Some(MOVIE_TMDB), None));

    assert_eq!(counters.resolved.load(Ordering::Relaxed), 1);
    assert!(tmdb.requests().iter().all(|r| r.starts_with("/movie/603")));
    assert!(!tmdb.requests().is_empty());
}

#[test]
fn a_movie_whose_art_was_cleared_is_fetched_again_by_id() {
    let tmdb = tmdb();
    let state = state_with_movie();
    let eng = engine_for(&state, "key".into());
    let counters = Counters::default();

    process_job(&eng, &counters, 1, None, movie_job(None, Some(MOVIE_TMDB)));

    assert_eq!(tmdb_id_of_movie(&state), Some(MOVIE_TMDB));
    assert!(tmdb.requests().iter().all(|r| !r.starts_with("/search")));
}

#[test]
fn a_miss_is_counted_and_nothing_is_stored() {
    let _tmdb = tmdb_with_nothing_found();
    let state = state_with_movie();
    let eng = engine_for(&state, "key".into());
    let counters = Counters::default();

    process_job(&eng, &counters, 1, None, movie_job(None, None));

    assert_eq!(counters.missed.load(Ordering::Relaxed), 1);
    assert_eq!(counters.processed.load(Ordering::Relaxed), 1);
    assert_eq!(tmdb_id_of_movie(&state), None);
}

#[test]
fn a_settled_show_with_unreachable_tmdb_still_counts_as_resolved() {
    let _tmdb = tmdb_with_nothing_found();
    let state = state_with_show();
    let eng = engine_for(&state, "key".into());
    let counters = Counters::default();
    let job = Job {
        id: SHOW_ID.into(),
        target: Target::Tv,
        title: "Show s1".into(),
        year: None,
        is_show: true,
        resolved_tmdb: Some(SHOW_TMDB),
        pin: None,
        refetch: None,
    };

    process_job(&eng, &counters, 1, None, job);

    assert_eq!(counters.resolved.load(Ordering::Relaxed), 1);
}

#[test]
fn a_failed_store_is_counted_as_failed() {
    let _tmdb = tmdb();
    let state = state();
    let eng = engine_for(&state, "key".into());
    let counters = Counters::default();
    let job = Job {
        id: "ghost".into(),
        ..movie_job(None, Some(MOVIE_TMDB))
    };

    process_job(&eng, &counters, 1, None, job);

    assert_eq!(
        counters.resolved.load(Ordering::Relaxed) + counters.failed.load(Ordering::Relaxed),
        1
    );
}
