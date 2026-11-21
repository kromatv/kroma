use super::*;

const TODAY: i64 = YESTERDAY + 86_400;

fn removed_yesterday(pool: &Pool) {
    pool.get()
        .unwrap()
        .execute("UPDATE watch_removals SET removed_at = ?1", [YESTERDAY])
        .unwrap();
}

fn removals(pool: &Pool) -> Vec<String> {
    rows(
        pool,
        "SELECT item_id || ' ' || kind FROM watch_removals ORDER BY 1",
    )
}

fn watched_and_saved(at: i64) -> Watching {
    Watching {
        listed: true,
        ..watched(at)
    }
}

#[test]
fn a_title_unmarked_here_stays_unwatched_when_the_other_server_offers_its_old_flag_again() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    merge(&pool, &ana, Place::Title("heat"), watched(LAST_WEEK));
    crate::unmark_watched(&pool, &ana, "heat").unwrap();

    let merged = merge(
        &pool,
        &ana,
        Place::Title("heat"),
        watched_and_saved(LAST_WEEK),
    );

    assert_eq!(merged, Merged::Changed);
    assert!(watched_flags(&pool).is_empty());
    assert_eq!(saved(&pool), ["heat"]);
}

#[test]
fn a_title_watched_again_there_after_it_was_unmarked_here_is_watched_here() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    merge(&pool, &ana, Place::Title("heat"), watched(LAST_WEEK));
    crate::unmark_watched(&pool, &ana, "heat").unwrap();
    removed_yesterday(&pool);

    let merged = merge(&pool, &ana, Place::Title("heat"), watched(TODAY));

    assert_eq!(merged, Merged::Changed);
    assert_eq!(watched_flags(&pool), ["heat on 2023-11-21T22:13:20Z"]);
}

#[test]
fn a_resume_point_removed_here_does_not_come_back_with_its_old_time() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    merge(
        &pool,
        &ana,
        Place::Title("heat"),
        stopped(600_000, LAST_WEEK),
    );
    crate::delete_progress(&pool, &ana, "heat").unwrap();

    let merged = merge(
        &pool,
        &ana,
        Place::Title("heat"),
        stopped(600_000, LAST_WEEK),
    );

    assert_eq!(merged, Merged::Unchanged);
    assert!(resume_points(&pool).is_empty());
}

#[test]
fn a_favourite_removed_here_comes_back_only_with_a_play_recorded_there_after_the_removal() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    merge(
        &pool,
        &ana,
        Place::Title("heat"),
        watched_and_saved(LAST_WEEK),
    );
    crate::remove_from_list(&pool, &ana, "heat").unwrap();
    removed_yesterday(&pool);

    let offered_again = merge(
        &pool,
        &ana,
        Place::Title("heat"),
        watched_and_saved(LAST_WEEK),
    );
    let played_since = merge(&pool, &ana, Place::Title("heat"), watched_and_saved(TODAY));

    assert_eq!(offered_again, Merged::Unchanged);
    assert_eq!(played_since, Merged::Changed);
    assert_eq!(saved(&pool), ["heat"]);
}

#[test]
fn a_removal_is_kept_only_for_what_was_there_to_remove() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    crate::mark_watched(&pool, &ana, "heat").unwrap();

    crate::unmark_watched(&pool, &ana, "heat").unwrap();
    crate::delete_progress(&pool, &ana, "heat").unwrap();
    crate::remove_from_list(&pool, &ana, "heat").unwrap();

    assert_eq!(removals(&pool), ["heat watched"]);
}
