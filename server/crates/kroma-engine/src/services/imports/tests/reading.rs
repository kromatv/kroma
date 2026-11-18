use serde_json::json;

use super::*;
use crate::model::imports::Status;
use crate::services::importers::MAX_PAGE_ROWS;

#[test]
fn an_import_surveys_the_server_then_reads_titles_watch_states_and_plays() {
    let server = household();
    let state = importing_from(&server);

    let ran = import(&state, &Recording::default(), &everything());

    assert!(ran.result.is_ok());
    assert_eq!(ran.import.status, Status::Completed);
    assert_eq!(
        server.methods_asked(),
        vec!["survey", "titles", "states", "plays"]
    );
    assert_eq!(
        server.asked("survey"),
        vec![json!({ "signIn": "s-1", "server": "srv" })]
    );
}

#[test]
fn a_library_is_read_to_its_last_page_with_the_cursor_each_page_gave() {
    let server = household();
    let state = importing_from(&server);

    import(&state, &Recording::default(), &kept(&["1"], &[]));

    assert_eq!(
        server.asked("titles"),
        vec![
            json!({ "signIn": "s-1", "server": "srv", "library": "1", "limit": MAX_PAGE_ROWS }),
            json!({
                "signIn": "s-1",
                "server": "srv",
                "library": "1",
                "cursor": "2",
                "limit": MAX_PAGE_ROWS,
            }),
        ]
    );
}

#[test]
fn only_the_libraries_and_the_users_the_owner_kept_are_read() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording::default();

    import(&state, &stages, &kept(&["2"], &["42"]));

    let given = stages.given();
    assert_eq!(given.libraries, vec!["2 was nothing"]);
    assert_eq!(given.users, vec!["42 was nothing"]);
    assert_eq!(given.titles, vec!["e1 in source-2"]);
    assert_eq!(given.states, vec!["e1 for account-42"]);
    assert_eq!(server.asked("titles").len(), 1);
    assert_eq!(server.asked("states").len(), 1);
}

#[test]
fn a_library_of_a_kind_this_server_does_not_play_is_left_out_when_kept() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording::default();

    import(&state, &stages, &kept(&["9"], &[]));

    assert_eq!(stages.given(), Given::default());
    assert!(server.asked("titles").is_empty());
}

#[test]
fn a_kept_id_the_other_server_no_longer_has_is_passed_over() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording::default();

    let ran = import(&state, &stages, &kept(&["gone"], &["gone"]));

    assert_eq!(ran.import.status, Status::Completed);
    assert_eq!(stages.given(), Given::default());
}

#[test]
fn a_title_that_is_neither_a_film_nor_an_episode_reaches_no_stage() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording::default();

    import(&state, &stages, &kept(&["1"], &[]));

    assert_eq!(
        stages.given().titles,
        vec!["t1 in source-1", "t2 in source-1", "t3 in source-1"]
    );
}

#[test]
fn each_watch_state_reaches_its_stage_with_its_title_and_the_account_of_its_user() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording::default();

    import(&state, &stages, &everything());

    assert_eq!(
        stages.given().states,
        vec![
            "t1 for account-42",
            "t2 for account-42",
            "e1 for account-42",
            "t1 for account-43",
        ]
    );
}

#[test]
fn a_user_is_asked_only_for_the_libraries_they_could_see() {
    let server = household();
    let state = importing_from(&server);

    import(&state, &Recording::default(), &kept(&["1", "2"], &["43"]));

    let libraries: Vec<Value> = server
        .asked("states")
        .iter()
        .map(|ask| ask["library"].clone())
        .collect();
    assert_eq!(libraries, vec![json!("1")]);
}

#[test]
fn a_user_whose_state_is_locked_has_an_account_and_gives_no_watch_state() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording::default();

    import(&state, &stages, &kept(&["1"], &["44"]));

    let given = stages.given();
    assert_eq!(given.users, vec!["44 was nothing"]);
    assert_eq!(given.plays, vec!["p3 for account-44"]);
    assert!(server.asked("states").is_empty());
}

#[test]
fn a_play_by_someone_left_out_or_of_a_title_never_described_reaches_no_stage() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording::default();

    import(&state, &stages, &everything());

    assert_eq!(
        stages.given().plays,
        vec![
            "p1 for account-42",
            "p2 for account-43",
            "p3 for account-44"
        ]
    );
}

#[test]
fn no_watch_state_and_no_play_is_read_while_no_user_has_an_account() {
    let server = household();
    let state = importing_from(&server);

    let ran = import(
        &state,
        &super::super::stages::Core,
        &kept(&["1", "2", "9"], &[]),
    );

    assert_eq!(ran.import.status, Status::Completed);
    assert_eq!(server.methods_asked(), vec!["survey", "titles"]);
}

#[test]
fn the_job_does_nothing_when_no_import_waits() {
    let server = household();
    let state = importing_from(&server);

    let result = run_on(&state, &Recording::default(), a_run());

    assert!(result.is_ok());
    assert!(server.methods_asked().is_empty());
    assert!(db::imports::list(&state.db, 10).unwrap().is_empty());
}
