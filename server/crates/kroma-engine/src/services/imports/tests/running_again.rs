use serde_json::json;

use super::*;
use crate::model::imports::Status;

fn record_of(state: &SharedState) -> (Vec<String>, Vec<String>) {
    (records(state), lines(state, TITLES))
}

#[test]
fn a_second_import_with_nothing_changed_gives_the_stages_no_row_and_writes_nothing() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording::default();
    import(&state, &stages, &everything());
    let brought = stages.given();
    let before = record_of(&state);

    let again = import(&state, &stages, &everything());

    let given = stages.given();
    assert_eq!(again.import.status, Status::Completed);
    assert_eq!(brought.titles.len(), 4);
    assert_eq!(
        (given.titles, given.states, given.plays),
        (vec![], vec![], vec![])
    );
    assert_eq!(record_of(&state), before);
    assert_eq!(again.import.report.titles.brought, 0);
    assert_eq!(again.import.report.states.brought, 0);
    assert_eq!(again.import.report.plays.brought, 0);
}

#[test]
fn a_second_import_hands_each_library_and_user_what_it_became_the_first_time() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording::default();
    import(&state, &stages, &kept(&["1"], &["42"]));
    stages.given();

    import(&state, &stages, &kept(&["1"], &["42"]));

    let given = stages.given();
    assert_eq!(given.libraries, vec!["1 was source-1"]);
    assert_eq!(given.users, vec!["42 was account-42"]);
}

#[test]
fn a_second_import_brings_only_the_rows_the_other_server_changed() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording::default();
    import(&state, &stages, &everything());
    stages.given();
    server.change(|household| {
        household.states[1].1 = json!({ "title": "t2", "watched": true });
        household.plays.push(play("p6", "42", "t3"));
        household.titles[2].1 = film("t3", "Thief (1981)");
    });

    let again = import(&state, &stages, &everything());

    let given = stages.given();
    assert_eq!(given.titles, vec!["t3 in source-1"]);
    assert_eq!(given.states, vec!["t2 for account-42"]);
    assert_eq!(given.plays, vec!["p6 for account-42"]);
    assert_eq!(again.import.report.states.read, 5);
    assert_eq!(again.import.report.states.brought, 1);
}

#[test]
fn a_second_import_asks_only_for_what_changed_since_the_first_read_everything() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording::default();
    import(&state, &stages, &kept(&["1"], &["42"]));
    let first: Vec<Value> = [server.asked("states"), server.asked("plays")].concat();
    server.forget_what_was_asked();
    let a_day_before_now = crate::test_support::now_secs() - 24 * 60 * 60;

    import(&state, &stages, &kept(&["1"], &["42"]));

    let again: Vec<Value> = [server.asked("states"), server.asked("plays")].concat();
    assert!(first.iter().all(|ask| ask.get("changedSince").is_none()));
    assert_eq!(again.len(), first.len());
    for ask in again {
        let since = ask["changedSince"].as_i64().unwrap();
        assert!((a_day_before_now - 60..=a_day_before_now).contains(&since));
    }
}

#[test]
fn a_read_that_left_a_row_unmatched_is_made_whole_again_and_offers_that_row() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording {
        nothing_here: vec!["t2"],
        ..Default::default()
    };
    import(&state, &stages, &kept(&["1"], &["42"]));
    stages.given();
    server.forget_what_was_asked();

    import(&state, &stages, &kept(&["1"], &["42"]));

    let given = stages.given();
    assert_eq!(given.states, vec!["t2 for account-42"]);
    assert!(server.asked("states")[0].get("changedSince").is_none());
}

#[test]
fn a_row_a_stage_left_untouched_is_offered_again_by_the_next_import() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording {
        left: vec!["t1"],
        ..Default::default()
    };
    import(&state, &stages, &kept(&["1"], &[]));
    stages.given();

    import(&state, &stages, &kept(&["1"], &[]));

    assert_eq!(stages.given().titles, vec!["t1 in source-1"]);
}

#[test]
fn a_row_already_held_here_is_settled_and_not_offered_again() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording {
        newer_here: vec!["t1"],
        ..Default::default()
    };
    let first = import(&state, &stages, &kept(&["1"], &["42"]));
    stages.given();

    import(&state, &stages, &kept(&["1"], &["42"]));

    assert_eq!(first.import.report.states.brought, 1);
    assert_eq!(stages.given().states, Vec::<String>::new());
}

#[test]
fn what_an_import_brought_is_remembered_under_a_new_sign_in_to_the_same_server() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording::default();
    import(&state, &stages, &everything());
    stages.given();

    let again = import_signed_in(&state, &stages, (&everything(), "s-2"));

    let given = stages.given();
    assert_eq!(again.import.sign_in.as_deref(), Some("s-2"));
    assert_eq!(given.users[0], "42 was account-42");
    assert_eq!(
        (given.titles, given.states, given.plays),
        (vec![], vec![], vec![])
    );
}

#[test]
fn a_user_kept_only_later_has_all_their_plays_read() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording::default();
    import(&state, &stages, &kept(&["1"], &["42"]));
    stages.given();
    server.forget_what_was_asked();

    import(&state, &stages, &kept(&["1"], &["42", "43"]));

    assert_eq!(stages.given().plays, vec!["p2 for account-43"]);
    assert!(server.asked("plays")[0].get("changedSince").is_none());
}
