mod finished;
mod held;
mod review;

use kroma_domain::watching::{Resume, Watching};
use kroma_domain::Permission;

use super::*;

const LAST_WEEK: i64 = 1_700_000_000;
const YESTERDAY: i64 = LAST_WEEK + 6 * 86_400;
const HEAT: &str = "/films/Heat (1995)/Heat.mkv";

fn stopped(position_ms: i64, at: i64) -> Watching {
    Watching {
        resume: Some(Resume {
            position_ms,
            duration_ms: Some(10_200_000),
            at,
        }),
        ..Default::default()
    }
}

fn watched(at: i64) -> Watching {
    Watching {
        watched_at: Some(at),
        ..Default::default()
    }
}

fn watched_and_stopped(position_ms: i64, at: i64) -> Watching {
    Watching {
        watched_at: Some(at),
        ..stopped(position_ms, at)
    }
}

fn favourite() -> Watching {
    Watching {
        listed: true,
        ..Default::default()
    }
}

fn an_account(pool: &Pool, name: &str) -> String {
    let address = format!("{name}@example.test");
    let account = crate::create_user(pool, &address, name, "", &[Permission::Playback]).unwrap();
    account.id
}

fn a_film(pool: &Pool, id: &str) {
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT OR IGNORE INTO libraries (id,name,kind,path,added_at) \
         VALUES ('lib','Films','movies','/films','t')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO items (id,kind,title,container,library,added_at) \
         VALUES (?1,'movie',?1,'mkv','lib','t')",
        [id],
    )
    .unwrap();
}

fn a_film_with_a_library_and_an_account() -> (TempPool, String) {
    let pool = pool();
    let account = an_account(&pool, "ana");
    a_film(&pool, "heat");
    (pool, account)
}

fn merge(pool: &Pool, account: &str, place: Place<'_>, state: Watching) -> Merged {
    merge_states(pool, account, &[(place, state)]).unwrap()[0]
}

fn rows(pool: &Pool, sql: &str) -> Vec<String> {
    let conn = pool.get().unwrap();
    let mut stmt = conn.prepare(sql).unwrap();
    let rows = stmt.query_map([], |r| r.get(0)).unwrap();
    rows.map(Result::unwrap).collect()
}

fn resume_points(pool: &Pool) -> Vec<String> {
    rows(
        pool,
        "SELECT item_id || ' at ' || position_ms || ' of ' || COALESCE(duration_ms, '?') \
         || ' on ' || updated_at FROM progress ORDER BY 1",
    )
}

fn watched_flags(pool: &Pool) -> Vec<String> {
    rows(
        pool,
        "SELECT item_id || ' on ' || watched_at FROM watched ORDER BY 1",
    )
}

fn saved(pool: &Pool) -> Vec<String> {
    rows(pool, "SELECT item_id FROM my_list ORDER BY 1")
}

#[test]
fn a_resume_point_lands_at_its_millisecond_with_the_time_the_other_server_recorded() {
    let (pool, ana) = a_film_with_a_library_and_an_account();

    let merged = merge(&pool, &ana, Place::Title("heat"), stopped(5_025_000, LAST_WEEK));

    assert_eq!(merged, Merged::Changed);
    assert_eq!(
        resume_points(&pool),
        ["heat at 5025000 of 10200000 on 2023-11-14T22:13:20Z"]
    );
}

#[test]
fn a_watched_flag_is_stamped_with_the_time_the_other_server_recorded() {
    let (pool, ana) = a_film_with_a_library_and_an_account();

    let merged = merge(&pool, &ana, Place::Title("heat"), watched(LAST_WEEK));

    assert_eq!(merged, Merged::Changed);
    assert_eq!(watched_flags(&pool), ["heat on 2023-11-14T22:13:20Z"]);
}

#[test]
fn a_person_who_watched_further_here_is_not_moved_back() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    crate::upsert_progress(&pool, &ana, "heat", 6_000_000, Some(10_200_000)).unwrap();
    let held = resume_points(&pool);

    let merged = merge(&pool, &ana, Place::Title("heat"), stopped(1_200_000, YESTERDAY));

    assert_eq!(merged, Merged::Unchanged);
    assert_eq!(resume_points(&pool), held);
}

#[test]
fn a_resume_point_newer_than_the_one_here_replaces_it() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    merge(&pool, &ana, Place::Title("heat"), stopped(600_000, LAST_WEEK));

    let merged = merge(&pool, &ana, Place::Title("heat"), stopped(1_200_000, YESTERDAY));

    assert_eq!(merged, Merged::Changed);
    assert_eq!(
        resume_points(&pool),
        ["heat at 1200000 of 10200000 on 2023-11-20T22:13:20Z"]
    );
}

#[test]
fn merging_the_same_state_twice_writes_nothing_the_second_time() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    let brought = Watching {
        listed: true,
        ..watched_and_stopped(600_000, LAST_WEEK)
    };
    merge(&pool, &ana, Place::Title("heat"), brought);
    let added_at = rows(&pool, "SELECT added_at FROM my_list");

    let again = merge(&pool, &ana, Place::Title("heat"), brought);

    assert_eq!(again, Merged::Unchanged);
    assert_eq!(rows(&pool, "SELECT added_at FROM my_list"), added_at);
    assert_eq!(resume_points(&pool).len(), 1);
    assert_eq!(watched_flags(&pool).len(), 1);
}

#[test]
fn a_title_unwatched_on_the_other_server_stays_as_this_server_has_it() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    crate::mark_finished(&pool, &ana, "heat").unwrap();
    crate::add_to_list(&pool, &ana, "heat").unwrap();
    crate::upsert_progress(&pool, &ana, "heat", 600_000, None).unwrap();

    let merged = merge(&pool, &ana, Place::Title("heat"), Watching::default());

    assert_eq!(merged, Merged::Unchanged);
    assert_eq!(watched_flags(&pool).len(), 1);
    assert_eq!(resume_points(&pool).len(), 1);
    assert_eq!(saved(&pool), ["heat"]);
}

#[test]
fn a_favourite_is_saved_to_the_list_once() {
    let (pool, ana) = a_film_with_a_library_and_an_account();

    let first = merge(&pool, &ana, Place::Title("heat"), favourite());
    let second = merge(&pool, &ana, Place::Title("heat"), favourite());

    assert_eq!((first, second), (Merged::Changed, Merged::Unchanged));
    assert_eq!(saved(&pool), ["heat"]);
}

#[test]
fn a_time_this_server_cannot_read_stands_against_any_other() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    crate::upsert_progress(&pool, &ana, "heat", 6_000_000, None).unwrap();
    pool.get()
        .unwrap()
        .execute("UPDATE progress SET updated_at = ''", [])
        .unwrap();

    let merged = merge(&pool, &ana, Place::Title("heat"), stopped(1_200_000, YESTERDAY));

    assert_eq!(merged, Merged::Unchanged);
    assert_eq!(resume_points(&pool), ["heat at 6000000 of ? on "]);
}

#[test]
fn a_state_whose_title_left_the_catalogue_is_answered_as_gone() {
    let (pool, ana) = a_film_with_a_library_and_an_account();

    let merged = merge(&pool, &ana, Place::Title("ronin"), stopped(600_000, LAST_WEEK));

    assert_eq!(merged, Merged::Gone);
    assert_eq!(resume_points(&pool), Vec::<String>::new());
}

#[test]
fn a_state_for_an_account_that_left_is_answered_as_gone() {
    let (pool, _) = a_film_with_a_library_and_an_account();

    let on_a_title = merge(&pool, "nobody", Place::Title("heat"), watched(LAST_WEEK));
    let for_a_file = merge(&pool, "nobody", Place::File(HEAT), watched(LAST_WEEK));

    assert_eq!((on_a_title, for_a_file), (Merged::Gone, Merged::Gone));
    assert_eq!(watched_flags(&pool), Vec::<String>::new());
}

#[test]
fn a_page_of_states_is_answered_one_by_one_in_the_order_given() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    a_film(&pool, "ronin");
    let page = [
        (Place::Title("heat"), watched(LAST_WEEK)),
        (Place::Title("thief"), watched(LAST_WEEK)),
        (Place::Title("ronin"), Watching::default()),
        (Place::Title("ronin"), stopped(600_000, LAST_WEEK)),
    ];

    let merged = merge_states(&pool, &ana, &page).unwrap();

    assert_eq!(
        merged,
        [
            Merged::Changed,
            Merged::Gone,
            Merged::Unchanged,
            Merged::Changed
        ]
    );
}
