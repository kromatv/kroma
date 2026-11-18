use super::*;
use crate::model::imports::Status;

fn a_week_of_watching() -> Vec<((&'static str, &'static str), Value)> {
    of_ana(vec![
        json!({
            "title": "t1",
            "watched": true,
            "favourite": true,
            "positionMs": 5_025_000,
            "lastPlayedAt": LAST_WEEK,
        }),
        stopped("t2", 600_000, LAST_WEEK),
    ])
}

#[test]
fn a_second_import_with_nothing_changed_writes_nothing() {
    let world = a_household_that_holds(heat_and_ronin(), a_week_of_watching());
    world.has_scanned(&[HEAT, RONIN]);
    let first = world.imports();
    let brought = world.watch_state();
    world.stages.others.given();

    let again = world.imports();

    assert_eq!(first.import.report.states, states(2, 2, 0));
    assert_eq!(again.import.report.states.brought, 0);
    assert_eq!(world.stages.others.given().states, Vec::<String>::new());
    assert_eq!(world.watch_state(), brought);
    assert_eq!(brought.len(), 4);
}

#[test]
fn a_page_offered_again_after_a_run_that_ended_before_its_record_changes_nothing() {
    let world = a_household_that_holds(heat_and_ronin(), a_week_of_watching());
    world.has_scanned(&[HEAT, RONIN]);
    world
        .stages
        .stops_after_the_states
        .store(true, Ordering::SeqCst);
    let stopped = world.imports();
    let written = world.watch_state();

    let again = world.imports();

    assert_eq!(stopped.import.status, Status::Failed);
    assert_eq!(again.import.status, Status::Completed);
    assert_eq!(again.import.report.states, states(2, 0, 0));
    assert_eq!(world.watch_state(), written);
    assert_eq!(written.len(), 4);
}

#[test]
fn a_held_state_is_settled_so_a_later_import_is_not_offered_it_and_holds_it_once() {
    let world = a_household_that_holds(heat_and_ronin(), a_week_of_watching());
    world.has_the_file(HEAT);
    world.has_the_file(RONIN);
    let first = world.imports();
    let held = world.watch_state();

    let again = world.imports();
    world.scans();

    assert_eq!(first.import.report.states, states(2, 2, 0));
    assert_eq!(again.import.report.states.brought, 0);
    assert_eq!(held.len(), 2);
    assert!(held.iter().all(|line| line.starts_with("held|")));
    assert_eq!(
        world.resume_point(HEAT),
        Some((5_025_000, LAST_WEEK_STAMP.to_string()))
    );
    assert_eq!(world.watch_state().len(), 4);
}

#[test]
fn a_held_page_offered_again_after_a_run_that_ended_before_its_record_is_held_once() {
    let world = a_household_that_holds(heat_and_ronin(), a_week_of_watching());
    world.has_the_file(HEAT);
    world.has_the_file(RONIN);
    world
        .stages
        .stops_after_the_states
        .store(true, Ordering::SeqCst);
    world.imports();
    let held = world.watch_state();

    let again = world.imports();

    assert_eq!(again.import.report.states, states(2, 0, 0));
    assert_eq!(world.watch_state(), held);
    assert_eq!(held.len(), 2);
}

#[test]
fn a_state_that_matched_nothing_is_brought_by_a_later_import_once_its_title_is_here() {
    let stopped_there = of_ana(vec![stopped("t2", 600_000, LAST_WEEK)]);
    let world = a_household_that_holds(heat_and_ronin(), stopped_there);
    world.has_scanned(&[HEAT]);
    let first = world.imports();
    world.has_scanned(&[RONIN]);

    let again = world.imports();

    assert_eq!(first.import.report.states, states(1, 0, 1));
    assert_eq!(again.import.report.states, states(1, 1, 0));
    assert_eq!(
        world.resume_point(RONIN).map(|(position, _)| position),
        Some(600_000)
    );
}

#[test]
fn a_user_whose_account_left_this_server_has_their_state_left_for_a_later_import() {
    let world = a_household_that_holds(heat_and_ronin(), a_week_of_watching());
    world.has_scanned(&[HEAT, RONIN]);
    db::delete_user(&world.state.db, &world.ana).unwrap();

    let ran = world.imports();

    assert_eq!(ran.import.status, Status::Completed);
    assert_eq!(ran.import.report.states, states(2, 0, 0));
    assert_eq!(world.watch_state(), Vec::<String>::new());
}
