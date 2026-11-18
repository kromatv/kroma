use super::*;

fn a_scan_reaches(pool: &Pool, path: &str, item: &str) -> usize {
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT INTO files (id,item_id,abs_path) VALUES (?1,?2,?1)",
        [path, item],
    )
    .unwrap();
    release_held_states(&conn).unwrap()
}

fn held(pool: &Pool) -> Vec<String> {
    rows(
        pool,
        "SELECT abs_path || ' watched ' || COALESCE(watched_at, '-') || ' at ' \
         || COALESCE(position_ms, '-') || ' on ' || COALESCE(resumed_at, '-') \
         || ' listed ' || listed FROM import_held_states ORDER BY 1",
    )
}

#[test]
fn a_state_for_a_file_no_title_has_is_held_and_shows_nowhere() {
    let (pool, ana) = a_film_with_a_library_and_an_account();

    let merged = merge(&pool, &ana, Place::File(HEAT), stopped(5_025_000, LAST_WEEK));

    assert_eq!(merged, Merged::Changed);
    assert_eq!(
        held(&pool),
        [format!("{HEAT} watched - at 5025000 on {LAST_WEEK} listed 0")]
    );
    assert_eq!(resume_points(&pool), Vec::<String>::new());
}

#[test]
fn a_held_state_shows_on_its_title_as_soon_as_a_scan_writes_its_file() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    let brought = Watching {
        listed: true,
        ..watched(LAST_WEEK).with(&stopped(5_025_000, LAST_WEEK))
    };
    merge(&pool, &ana, Place::File(HEAT), brought);

    let released = a_scan_reaches(&pool, HEAT, "heat");

    assert_eq!(released, 1);
    assert_eq!(
        resume_points(&pool),
        ["heat at 5025000 of 10200000 on 2023-11-14T22:13:20Z"]
    );
    assert_eq!(watched_flags(&pool), ["heat on 2023-11-14T22:13:20Z"]);
    assert_eq!(saved(&pool), ["heat"]);
    assert_eq!(held(&pool), Vec::<String>::new());
}

#[test]
fn a_scan_that_reaches_another_file_keeps_holding_the_state() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    merge(&pool, &ana, Place::File(HEAT), watched(LAST_WEEK));

    let released = a_scan_reaches(&pool, "/films/Ronin (1998)/Ronin.mkv", "heat");

    assert_eq!(released, 0);
    assert_eq!(held(&pool).len(), 1);
    assert_eq!(watched_flags(&pool), Vec::<String>::new());
}

#[test]
fn a_state_held_twice_is_held_once_and_changes_nothing_the_second_time() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    merge(&pool, &ana, Place::File(HEAT), stopped(5_025_000, LAST_WEEK));
    let first = held(&pool);

    let again = merge(&pool, &ana, Place::File(HEAT), stopped(5_025_000, LAST_WEEK));

    assert_eq!(again, Merged::Unchanged);
    assert_eq!(held(&pool), first);
}

#[test]
fn two_states_held_for_one_account_and_one_file_keep_the_newer_of_each_part() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    merge(&pool, &ana, Place::File(HEAT), stopped(600_000, YESTERDAY));

    let older = merge(&pool, &ana, Place::File(HEAT), stopped(5_025_000, LAST_WEEK));
    let flag = merge(&pool, &ana, Place::File(HEAT), watched(LAST_WEEK));

    assert_eq!((older, flag), (Merged::Unchanged, Merged::Changed));
    assert_eq!(
        held(&pool),
        [format!(
            "{HEAT} watched {LAST_WEEK} at 600000 on {YESTERDAY} listed 0"
        )]
    );
}

#[test]
fn a_state_with_nothing_in_it_is_not_held() {
    let (pool, ana) = a_film_with_a_library_and_an_account();

    let merged = merge(&pool, &ana, Place::File(HEAT), Watching::default());

    assert_eq!(merged, Merged::Unchanged);
    assert_eq!(held(&pool), Vec::<String>::new());
}

#[test]
fn a_held_state_older_than_what_the_account_did_since_moves_nothing_back() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    merge(&pool, &ana, Place::File(HEAT), stopped(600_000, LAST_WEEK));
    crate::upsert_progress(&pool, &ana, "heat", 6_000_000, Some(10_200_000)).unwrap();
    let watched_here = resume_points(&pool);

    let released = a_scan_reaches(&pool, HEAT, "heat");

    assert_eq!(released, 1);
    assert_eq!(resume_points(&pool), watched_here);
    assert_eq!(held(&pool), Vec::<String>::new());
}

#[test]
fn a_state_held_for_a_file_a_scan_wrote_a_moment_before_shows_at_once() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    a_scan_reaches(&pool, HEAT, "heat");

    let merged = merge(&pool, &ana, Place::File(HEAT), watched(LAST_WEEK));

    assert_eq!(merged, Merged::Changed);
    assert_eq!(watched_flags(&pool), ["heat on 2023-11-14T22:13:20Z"]);
    assert_eq!(held(&pool), Vec::<String>::new());
}

#[test]
fn the_states_held_for_an_account_go_with_it() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    merge(&pool, &ana, Place::File(HEAT), watched(LAST_WEEK));

    crate::delete_user(&pool, &ana).unwrap();

    assert_eq!(held(&pool), Vec::<String>::new());
}
