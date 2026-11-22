use super::*;
use crate::model::imports::Status;

fn a_week_of_plays() -> Vec<Value> {
    vec![play("p1", "42", "t1"), play("p2", "42", "t2")]
}

fn rows_of_the_log(world: &World) -> Vec<String> {
    lines(
        &world.state,
        "SELECT id || '|' || user_id || '|' || item_id || '|' || ended_at \
         FROM play_history ORDER BY 1",
    )
}

#[test]
fn a_second_import_with_nothing_changed_adds_no_play() {
    let world = a_household_that_played(a_week_of_plays());
    world.has_scanned(&[HEAT, RONIN]);
    let first = imports_plays(&world);
    let brought = rows_of_the_log(&world);

    let again = imports_plays(&world);

    assert_eq!(first.import.report.plays, plays(2, 2, 0));
    assert_eq!(again.import.report.plays, plays(2, 0, 0));
    assert_eq!(rows_of_the_log(&world), brought);
    assert_eq!(brought.len(), 2);
}

#[test]
fn a_page_offered_again_after_a_run_that_ended_before_its_record_adds_no_second_copy() {
    let world = a_household_that_played(a_week_of_plays());
    world.has_scanned(&[HEAT, RONIN]);
    let stopped = imports_plays_and(&world, true);
    let written = rows_of_the_log(&world);

    let again = imports_plays(&world);

    assert_eq!(stopped.import.status, Status::Failed);
    assert_eq!(again.import.status, Status::Completed);
    assert_eq!(again.import.report.plays, plays(2, 0, 0));
    assert_eq!(rows_of_the_log(&world), written);
    assert_eq!(written.len(), 2);
}

#[test]
fn a_play_the_other_server_recorded_since_the_last_import_is_the_only_one_added() {
    let world = a_household_that_played(a_week_of_plays());
    world.has_scanned(&[HEAT, RONIN]);
    imports_plays(&world);
    world.server.change(|household| {
        household.plays.push(json!({
            "id": "p3",
            "user": "42",
            "title": "t2",
            "playedAt": LAST_WEEK + A_DAY,
        }));
    });

    let again = imports_plays(&world);

    let log = watch_history(&world);
    assert_eq!(again.import.report.plays, plays(3, 1, 0));
    assert_eq!(log.len(), 3);
    assert_eq!(log[0].ended_at, LAST_WEEK + A_DAY);
}

#[test]
fn a_held_play_is_settled_so_a_later_import_is_not_offered_it_and_holds_it_once() {
    let world = a_household_that_played(a_week_of_plays());
    world.has_the_file(HEAT);
    world.has_the_file(RONIN);
    let first = imports_plays(&world);
    let held = held_plays(&world);

    let again = imports_plays(&world);
    world.scans();

    assert_eq!(first.import.report.plays, plays(2, 2, 0));
    assert_eq!(again.import.report.plays, plays(2, 0, 0));
    assert_eq!(held.len(), 2);
    assert_eq!(watch_history(&world).len(), 2);
    assert_eq!(held_plays(&world), Vec::<String>::new());
}

#[test]
fn a_held_page_offered_again_after_a_run_that_ended_before_its_record_is_held_once() {
    let world = a_household_that_played(a_week_of_plays());
    world.has_the_file(HEAT);
    world.has_the_file(RONIN);
    imports_plays_and(&world, true);
    let held = held_plays(&world);

    let again = imports_plays(&world);

    assert_eq!(again.import.report.plays, plays(2, 0, 0));
    assert_eq!(held_plays(&world), held);
    assert_eq!(held.len(), 2);
    assert_eq!(watch_history(&world).len(), 0);
}

#[test]
fn a_play_that_matched_nothing_is_brought_by_a_later_import_once_its_title_is_here() {
    let world = a_household_that_played(vec![play("p1", "42", "t2")]);
    world.has_scanned(&[HEAT]);
    let first = imports_plays(&world);
    world.has_scanned(&[RONIN]);

    let again = imports_plays(&world);

    assert_eq!(first.import.report.plays, plays(1, 0, 1));
    assert_eq!(again.import.report.plays, plays(1, 1, 0));
    assert_eq!(
        watch_history(&world)[0].item_id,
        Some(world.title_of(RONIN))
    );
}

#[test]
fn a_play_of_a_user_whose_account_left_this_server_is_left_for_a_later_import() {
    let world = a_household_that_played(a_week_of_plays());
    world.has_scanned(&[HEAT, RONIN]);
    db::delete_user(&world.state.db, &world.ana).unwrap();

    let ran = imports_plays(&world);

    assert_eq!(ran.import.status, Status::Completed);
    assert_eq!(ran.import.report.plays, plays(2, 0, 0));
    assert_eq!(rows_of_the_log(&world), Vec::<String>::new());
}
