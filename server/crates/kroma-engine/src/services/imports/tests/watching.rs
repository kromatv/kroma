mod again;
mod finding;
mod home;
mod played;
mod removed;
mod review;
mod world;

use std::sync::atomic::Ordering;

use self::world::{
    A_DAY, HEAT, LAST_WEEK, LAST_WEEK_STAMP, RONIN, World, a_household_that_holds, film_at,
    folder, heat_and_ronin, of_ana, stopped,
};
use super::*;
use crate::db::imports::Window;
use crate::model::imports::Tally;

fn states(read: u64, brought: u64, unmatched: u64) -> Tally {
    Tally {
        read,
        brought,
        unmatched,
    }
}

#[test]
fn a_film_stopped_at_a_second_on_the_other_server_resumes_at_that_second() {
    let stopped_there = of_ana(vec![stopped("t1", 5_025_000, LAST_WEEK)]);
    let world = a_household_that_holds(heat_and_ronin(), stopped_there);
    world.has_scanned(&[HEAT, RONIN]);

    let ran = world.imports();

    assert_eq!(ran.import.report.states, states(1, 1, 0));
    assert_eq!(
        world.resume_point(HEAT),
        Some((5_025_000, LAST_WEEK_STAMP.to_string()))
    );
    assert_eq!(world.resume_point(RONIN), None);
}

#[test]
fn a_person_who_watched_further_on_this_server_is_not_moved_back() {
    let stopped_there = of_ana(vec![stopped("t1", 1_200_000, LAST_WEEK)]);
    let world = a_household_that_holds(heat_and_ronin(), stopped_there);
    world.has_scanned(&[HEAT]);
    let heat = world.title_of(HEAT);
    db::upsert_progress(&world.state.db, &world.ana, &heat, 6_000_000, None).unwrap();
    let watched_here = world.resume_point(HEAT);

    let ran = world.imports();

    assert_eq!(ran.import.report.states, states(1, 0, 0));
    assert_eq!(world.resume_point(HEAT), watched_here);
    assert_eq!(watched_here.map(|(position, _)| position), Some(6_000_000));
}

#[test]
fn an_import_removes_no_watch_state() {
    let said_there = of_ana(vec![
        json!({ "title": "t1", "watched": false, "positionMs": 0, "favourite": false }),
        json!({ "title": "t2", "watched": true, "lastPlayedAt": LAST_WEEK }),
    ]);
    let world = a_household_that_holds(heat_and_ronin(), said_there);
    world.has_scanned(&[HEAT, RONIN]);
    let (heat, ronin) = (world.title_of(HEAT), world.title_of(RONIN));
    db::mark_finished(&world.state.db, &world.ana, &heat).unwrap();
    db::add_to_list(&world.state.db, &world.ana, &heat).unwrap();
    db::upsert_progress(&world.state.db, &world.ana, &heat, 600_000, None).unwrap();
    db::upsert_progress(&world.state.db, &world.ana, &ronin, 900_000, None).unwrap();
    let held_here = world.watch_state();

    world.imports();

    let after = world.watch_state();
    let added: Vec<&String> = after
        .iter()
        .filter(|row| !held_here.contains(row))
        .collect();
    assert_eq!(held_here.len(), 4);
    assert!(held_here.iter().all(|row| after.contains(row)));
    assert_eq!(added, [&format!("watched|{}|{ronin}|{LAST_WEEK_STAMP}", world.ana)]);
}

#[test]
fn state_for_a_file_scanned_later_shows_as_soon_as_the_scan_reaches_it() {
    let stopped_there = of_ana(vec![stopped("t1", 5_025_000, LAST_WEEK)]);
    let world = a_household_that_holds(heat_and_ronin(), stopped_there);
    world.has_the_file(HEAT);
    let ran = world.imports();
    let before_the_scan = world.watch_state();

    world.scans();

    assert_eq!(ran.import.report.states, states(1, 1, 0));
    assert_eq!(before_the_scan.len(), 1);
    assert!(before_the_scan[0].starts_with("held|"));
    assert_eq!(
        world.resume_point(HEAT),
        Some((5_025_000, LAST_WEEK_STAMP.to_string()))
    );
    assert_eq!(world.watch_state().len(), 1);
}

#[test]
fn a_state_whose_title_is_nothing_here_is_listed_in_the_report_by_its_name_and_its_file() {
    let stopped_there = of_ana(vec![
        stopped("t1", 5_025_000, LAST_WEEK),
        stopped("t2", 600_000, LAST_WEEK),
    ]);
    let world = a_household_that_holds(heat_and_ronin(), stopped_there);
    world.has_scanned(&[HEAT]);

    let ran = world.imports();

    let window = Window {
        offset: 0,
        limit: 10,
    };
    let listed = db::imports::unmatched(&world.state.db, &ran.import.id, window).unwrap();
    assert_eq!(ran.import.report.states, states(2, 1, 1));
    assert_eq!(ran.import.unmatched_titles, 1);
    assert_eq!(listed[0].title.as_deref(), Some("Ronin"));
    assert_eq!(
        listed[0].paths,
        vec!["/data/movies/Ronin (1998)/Ronin (1998).mkv"]
    );
}

#[test]
fn watched_flags_and_favourites_come_over_with_the_time_the_other_server_recorded() {
    let said_there = of_ana(vec![json!({
        "title": "t1",
        "watched": true,
        "favourite": true,
        "lastPlayedAt": LAST_WEEK,
    })]);
    let world = a_household_that_holds(heat_and_ronin(), said_there);
    world.has_scanned(&[HEAT]);
    let heat = world.title_of(HEAT);

    world.imports();

    let flags = lines(&world.state, "SELECT watched_at FROM watched");
    let watched = db::list_watched(&world.state.db, &world.ana).unwrap();
    let saved = db::list_my_list(&world.state.db, &world.ana).unwrap();
    assert_eq!(watched, [heat.as_str()]);
    assert_eq!(saved, [heat.as_str()]);
    assert_eq!(flags, [LAST_WEEK_STAMP]);
}

#[test]
fn a_newer_resume_point_on_the_other_server_wins_and_a_tie_goes_to_this_server() {
    let stopped_there = of_ana(vec![
        stopped("t1", 1_200_000, LAST_WEEK + A_DAY),
        stopped("t2", 1_200_000, LAST_WEEK),
    ]);
    let world = a_household_that_holds(heat_and_ronin(), stopped_there.clone());
    world.has_scanned(&[HEAT, RONIN]);
    world.imports();
    world.server.change(|household| {
        household.states = of_ana(vec![
            stopped("t1", 3_000_000, LAST_WEEK + 2 * A_DAY),
            stopped("t2", 3_000_000, LAST_WEEK),
        ]);
    });

    let ran = world.imports();

    assert_eq!(ran.import.report.states, states(2, 1, 0));
    assert_eq!(
        world.resume_point(HEAT).map(|(position, _)| position),
        Some(3_000_000)
    );
    assert_eq!(
        world.resume_point(RONIN).map(|(position, _)| position),
        Some(1_200_000)
    );
}

#[test]
fn two_users_attached_to_one_account_merge_into_it_and_the_newer_wins() {
    let said_there = vec![
        (("42", "1"), stopped("t1", 1_200_000, LAST_WEEK)),
        (("43", "1"), stopped("t1", 3_000_000, LAST_WEEK + A_DAY)),
        (("43", "1"), json!({ "title": "t2", "watched": true })),
    ];
    let mut world = a_household_that_holds(heat_and_ronin(), said_there);
    world.stages.accounts.insert("43", world.ana.clone());
    world.has_scanned(&[HEAT, RONIN]);

    let ran = world.imports();

    let ronin = world.title_of(RONIN);
    assert_eq!(ran.import.report.states, states(3, 3, 0));
    assert_eq!(
        world.resume_point(HEAT).map(|(position, _)| position),
        Some(3_000_000)
    );
    assert_eq!(db::list_watched(&world.state.db, &world.ana).unwrap(), [ronin]);
}
