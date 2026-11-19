use std::collections::BTreeMap;
use std::ops::ControlFlow;
use std::path::Path;

use super::super::*;
use super::tmp_root;
use crate::db;
use crate::model::Permission;
use crate::services::settings::set_library_defs;
use crate::state::SharedState;
use crate::test_support::{test_state, test_state_reading};

const RESUME_MS: i64 = 60_000;

struct Watched {
    viewer: String,
    film: String,
}

fn owner_library(root: &Path) -> LibraryDef {
    LibraryDef {
        id: "lib-owner".into(),
        name: "Films".into(),
        kind: "movies".into(),
        folders: vec![root.to_string_lossy().into_owned()],
        auto_scan: true,
    }
}

fn a_film_the_viewer_stopped_in(state: &SharedState, root: &Path) -> Watched {
    std::fs::write(root.join("Heat (1995).mkv"), b"x").unwrap();
    set_library_defs(&state.settings, &state.db, &[owner_library(root)]);
    rescan_sync(&WalkTurn::wait(), state, &mut uninterrupted).unwrap();
    let film = db::list_items(&state.db, None).unwrap().remove(0).id;
    let viewer = db::create_user(
        &state.db,
        "viewer@example.test",
        "viewer",
        "hash",
        &[Permission::Playback],
    )
    .unwrap()
    .id;
    db::upsert_progress(&state.db, &viewer, &film, RESUME_MS, None).unwrap();
    Watched { viewer, film }
}

fn store_a_list_that_does_not_parse(state: &SharedState) {
    state.settings.set_patch(
        &state.db,
        BTreeMap::from([(
            "libraries".to_string(),
            serde_json::json!([{ "name": "Films" }]),
        )]),
    );
}

fn kept(state: &SharedState, watched: &Watched) -> (bool, Option<i64>) {
    let library = db::list_libraries(&state.db)
        .unwrap()
        .iter()
        .any(|library| library.id == "lib-owner");
    let resume = db::get_progress(&state.db, &watched.viewer, &watched.film)
        .unwrap()
        .map(|entry| entry.position_ms);
    (library, resume)
}

#[test]
fn a_stored_list_that_does_not_parse_keeps_the_library_when_the_environment_folder_reads_empty() {
    let environment = tmp_root("list-env-empty");
    let state = test_state_reading(environment.path());
    let root = tmp_root("list-owner-empty");
    let watched = a_film_the_viewer_stopped_in(&state, root.path());
    store_a_list_that_does_not_parse(&state);

    let _ = rescan_sync(&WalkTurn::wait(), &state, &mut uninterrupted);

    assert_eq!(kept(&state, &watched), (true, Some(RESUME_MS)));
}

#[test]
fn a_stored_list_that_does_not_parse_is_not_replaced_with_the_demo_catalogue() {
    let state = test_state();
    let root = tmp_root("list-owner-demo");
    let watched = a_film_the_viewer_stopped_in(&state, root.path());
    store_a_list_that_does_not_parse(&state);

    let _ = rescan_sync(&WalkTurn::wait(), &state, &mut uninterrupted);

    assert_eq!(kept(&state, &watched), (true, Some(RESUME_MS)));
}

#[test]
fn a_walk_stopped_at_its_start_keeps_the_library_of_a_stored_list_that_does_not_parse() {
    let environment = tmp_root("list-env-film");
    std::fs::write(environment.path().join("Alien (1979).mkv"), b"x").unwrap();
    let state = test_state_reading(environment.path());
    let root = tmp_root("list-owner-stopped");
    let watched = a_film_the_viewer_stopped_in(&state, root.path());
    store_a_list_that_does_not_parse(&state);

    let _ = rescan_sync(&WalkTurn::wait(), &state, &mut |_| ControlFlow::Break(()));

    assert_eq!(kept(&state, &watched), (true, Some(RESUME_MS)));
}

#[test]
fn a_scan_of_a_stored_list_that_does_not_parse_fails_and_says_why() {
    let state = test_state();
    let root = tmp_root("list-owner-message");
    a_film_the_viewer_stopped_in(&state, root.path());
    store_a_list_that_does_not_parse(&state);

    let failed = rescan_sync(&WalkTurn::wait(), &state, &mut uninterrupted);

    let message = failed.err().map(|error| error.to_string());
    assert!(
        message.is_some_and(|message| message.contains("cannot be read")),
        "the scan did not fail on the list"
    );
}

#[test]
fn a_stored_list_whose_row_is_not_json_keeps_the_library() {
    let environment = tmp_root("list-env-row");
    std::fs::write(environment.path().join("Alien (1979).mkv"), b"x").unwrap();
    let state = test_state_reading(environment.path());
    let root = tmp_root("list-owner-row");
    let watched = a_film_the_viewer_stopped_in(&state, root.path());
    state
        .db
        .get()
        .unwrap()
        .execute(
            "UPDATE settings SET value = '[{' WHERE key = 'libraries'",
            [],
        )
        .unwrap();
    state.settings.reload(&state.db);

    let _ = rescan_sync(&WalkTurn::wait(), &state, &mut uninterrupted);

    assert_eq!(kept(&state, &watched), (true, Some(RESUME_MS)));
}
