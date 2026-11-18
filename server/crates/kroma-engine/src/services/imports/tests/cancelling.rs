use super::*;
use crate::model::imports::{Kind, Status};

fn cancelled_at_the_first_page_of_titles(state: &SharedState, stages: &Recording) -> Import {
    let id = queue(state, &everything(), "s-1");
    let run = a_run();
    *stages.cancels_at_the_first_titles.lock().unwrap() = Some(run.clone());
    run_on(state, stages, run).unwrap();
    db::imports::get(&state.db, &id).unwrap().unwrap()
}

#[test]
fn a_cancelled_import_ends_as_cancelled_and_reads_no_further() {
    let server = household();
    let state = importing_from(&server);

    let cancelled = cancelled_at_the_first_page_of_titles(&state, &Recording::default());

    assert_eq!(cancelled.status, Status::Cancelled);
    assert_eq!(cancelled.failure, None);
    assert!(cancelled.finished_at.is_some());
    assert_eq!(server.asked("titles").len(), 1);
    assert!(server.asked("states").is_empty());
}

#[test]
fn a_cancelled_import_keeps_what_it_had_brought_and_says_so_in_its_report() {
    let server = household();
    let state = importing_from(&server);

    let cancelled = cancelled_at_the_first_page_of_titles(&state, &Recording::default());

    let server_id = db::imports::server_key(IMPORTER, "srv");
    let sources = db::imports::targets(&state.db, &server_id, Kind::Library).unwrap();
    let titles = records(&state)
        .iter()
        .filter(|record| record.starts_with("title|"))
        .count();
    assert_eq!(cancelled.report.libraries.brought, 2);
    assert_eq!(cancelled.report.users.brought, 3);
    assert_eq!(cancelled.report.titles.brought, 2);
    assert_eq!(sources.len(), 2);
    assert_eq!(titles, 2);
}

#[test]
fn the_import_after_a_cancelled_one_brings_only_what_was_left() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording::default();
    cancelled_at_the_first_page_of_titles(&state, &stages);
    stages.given();

    let next = import(&state, &stages, &everything());

    let given = stages.given();
    assert_eq!(next.import.status, Status::Completed);
    assert_eq!(given.titles, vec!["t3 in source-1", "e1 in source-2"]);
    assert_eq!(given.states.len(), 4);
    assert_eq!(given.plays.len(), 3);
}

#[test]
fn an_import_cancelled_before_it_read_anything_brings_nothing() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording::default();
    let id = queue(&state, &everything(), "s-1");
    let run = a_run();
    run.request_cancel();

    run_on(&state, &stages, run).unwrap();

    let cancelled = db::imports::get(&state.db, &id).unwrap().unwrap();
    assert_eq!(cancelled.status, Status::Cancelled);
    assert_eq!(stages.given(), Given::default());
    assert!(server.methods_asked().is_empty());
}

#[test]
fn an_import_cancelled_on_its_last_page_ends_as_cancelled_like_its_run() {
    let server = household();
    let state = importing_from(&server);
    let stages = Recording::default();
    let id = queue(&state, &kept(&["2"], &[]), "s-1");
    let run = a_run();
    *stages.cancels_at_the_first_titles.lock().unwrap() = Some(run.clone());

    run_on(&state, &stages, run).unwrap();

    let cancelled = db::imports::get(&state.db, &id).unwrap().unwrap();
    assert_eq!(cancelled.status, Status::Cancelled);
    assert_eq!(cancelled.report.titles.brought, 1);
}
