use super::*;

const YESTERDAY_STAMP: &str = "2023-11-20T22:13:20Z";

fn held(pool: &Pool) -> Vec<String> {
    rows(
        pool,
        "SELECT 'watched ' || COALESCE(watched_at, '-') || ' at ' || COALESCE(position_ms, '-') \
         FROM import_held_states",
    )
}

#[test]
fn a_title_finished_there_after_the_person_stopped_in_it_here_loses_its_resume_point() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    merge(&pool, &ana, Place::Title("heat"), stopped(600_000, LAST_WEEK));

    let merged = merge(&pool, &ana, Place::Title("heat"), watched(YESTERDAY));

    assert_eq!(merged, Merged::Changed);
    assert_eq!(watched_flags(&pool), [format!("heat on {YESTERDAY_STAMP}")]);
    assert_eq!(resume_points(&pool), Vec::<String>::new());
}

#[test]
fn a_watched_flag_older_than_the_resume_point_here_comes_and_leaves_it() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    merge(&pool, &ana, Place::Title("heat"), stopped(600_000, YESTERDAY));

    let merged = merge(&pool, &ana, Place::Title("heat"), watched(LAST_WEEK));

    assert_eq!(merged, Merged::Changed);
    assert_eq!(watched_flags(&pool).len(), 1);
    assert_eq!(
        resume_points(&pool),
        [format!("heat at 600000 of 10200000 on {YESTERDAY_STAMP}")]
    );
}

#[test]
fn a_resume_point_a_player_saved_after_the_title_was_finished_there_stays() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    crate::upsert_progress(&pool, &ana, "heat", 600_000, Some(10_200_000)).unwrap();
    let saved_here = resume_points(&pool);

    let merged = merge(&pool, &ana, Place::Title("heat"), watched(YESTERDAY));

    assert_eq!(merged, Merged::Changed);
    assert_eq!(resume_points(&pool), saved_here);
}

#[test]
fn a_title_started_again_there_after_it_was_finished_keeps_its_new_resume_point() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    merge(&pool, &ana, Place::Title("heat"), stopped(600_000, LAST_WEEK));

    merge(
        &pool,
        &ana,
        Place::Title("heat"),
        watched_and_stopped(1_200_000, YESTERDAY),
    );

    assert_eq!(watched_flags(&pool), [format!("heat on {YESTERDAY_STAMP}")]);
    assert_eq!(
        resume_points(&pool),
        [format!("heat at 1200000 of 10200000 on {YESTERDAY_STAMP}")]
    );
}

#[test]
fn a_flag_this_server_already_holds_takes_no_resume_point_away() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    merge(&pool, &ana, Place::Title("heat"), stopped(600_000, LAST_WEEK));
    crate::mark_finished(&pool, &ana, "heat").unwrap();

    let merged = merge(&pool, &ana, Place::Title("heat"), watched(YESTERDAY));

    assert_eq!(merged, Merged::Unchanged);
    assert_eq!(resume_points(&pool).len(), 1);
}

#[test]
fn a_held_resume_point_gives_way_to_a_newer_flag_held_for_the_same_file() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    merge(&pool, &ana, Place::File(HEAT), stopped(600_000, LAST_WEEK));

    let merged = merge(&pool, &ana, Place::File(HEAT), watched(YESTERDAY));

    assert_eq!(merged, Merged::Changed);
    assert_eq!(held(&pool), [format!("watched {YESTERDAY} at -")]);
}
