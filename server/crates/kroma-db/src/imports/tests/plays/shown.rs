use kroma_domain::{ImportedFrom, PlayRecord, WatchKind};

use super::*;
use crate::{history_since, record_play, top_users, PlaySort};

fn a_play_of_this_server(pool: &Pool, account: &str, watched_ms: i64) {
    let play = PlayRecord {
        user_id: Some(account.into()),
        username: Some("ana".into()),
        item_id: Some("heat".into()),
        kind: "movie".into(),
        title: "heat".into(),
        started_at: LAST_WEEK,
        ended_at: LAST_WEEK,
        watched_ms,
        ..PlayRecord::default()
    };
    record_play(pool, &play).unwrap();
}

fn time_watched(pool: &Pool) -> (i64, i64) {
    let people = top_users(pool, 0, 10).unwrap();
    let charted = history_since(pool, 0, None, Some(WatchKind::Movie)).unwrap();
    (
        people.iter().map(|person| person.watched_ms).sum(),
        charted.iter().map(|row| row.watched_ms).sum(),
    )
}

#[test]
fn an_imported_row_says_so_and_names_the_server_it_came_from() {
    let home = a_household();

    home.plays_heat("p1");

    assert_eq!(
        logged(&home.pool)[0].imported_from,
        Some(ImportedFrom {
            importer: IMPORTER.into(),
            name: "Living room".into(),
        })
    );
}

#[test]
fn a_play_of_this_server_names_no_other_server() {
    let home = a_household();
    runs_for(&home.pool, "heat", HEAT_RUNS_MS);

    a_play_of_this_server(&home.pool, &home.ana, 0);

    let log = logged(&home.pool);
    assert_eq!(log[0].imported_from, None);
    assert_eq!((log[0].watched_ms, log[0].watched_is_runtime), (0, false));
}

#[test]
fn a_play_with_no_duration_shows_the_runtime_of_its_title_and_says_so() {
    let home = a_household();
    runs_for(&home.pool, "heat", HEAT_RUNS_MS);

    home.plays_heat("p1");

    let log = logged(&home.pool);
    assert_eq!(log[0].watched_ms, HEAT_RUNS_MS);
    assert!(log[0].watched_is_runtime);
}

#[test]
fn time_watched_counts_a_play_with_no_duration_at_the_runtime_of_its_title() {
    let home = a_household();
    runs_for(&home.pool, "heat", HEAT_RUNS_MS);
    a_play_of_this_server(&home.pool, &home.ana, 60_000);

    home.plays_heat("p1");

    assert_eq!(
        time_watched(&home.pool),
        (HEAT_RUNS_MS + 60_000, HEAT_RUNS_MS + 60_000)
    );
}

#[test]
fn a_play_brought_before_its_title_has_a_runtime_counts_once_the_runtime_is_known() {
    let home = a_household();
    home.plays_heat("p1");
    let before_the_probe = time_watched(&home.pool);

    runs_for(&home.pool, "heat", HEAT_RUNS_MS);

    assert_eq!(before_the_probe, (0, 0));
    assert_eq!(time_watched(&home.pool), (HEAT_RUNS_MS, HEAT_RUNS_MS));
    assert!(logged(&home.pool)[0].watched_is_runtime);
}

#[test]
fn the_log_orders_by_time_watched_with_the_runtime_standing_in() {
    let home = a_household();
    runs_for(&home.pool, "heat", HEAT_RUNS_MS);
    a_play_of_this_server(&home.pool, &home.ana, HEAT_RUNS_MS - 1);
    a_play_of_this_server(&home.pool, &home.ana, HEAT_RUNS_MS + 1);
    home.plays_heat("p1");
    let longest_first = PlayFilter {
        sort: PlaySort::parse("watchedMs:desc").unwrap(),
        ..PlayFilter::default()
    };

    let log = crate::plays(&home.pool, &longest_first, 50, 0).unwrap();

    assert_eq!(
        log.iter().map(|row| row.watched_ms).collect::<Vec<_>>(),
        [HEAT_RUNS_MS + 1, HEAT_RUNS_MS, HEAT_RUNS_MS - 1]
    );
}
