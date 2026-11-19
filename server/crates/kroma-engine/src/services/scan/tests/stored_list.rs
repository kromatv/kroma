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
    let unreadable = serde_json::json!([{ "name": "Films" }]);
    db::settings_set(&state.db, "libraries", &unreadable).unwrap();
    state.settings.reload(&state.db);
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
fn a_scan_of_a_stored_list_that_does_not_parse_fails_and_names_the_library_to_keep() {
    let state = test_state();
    let root = tmp_root("list-owner-message");
    a_film_the_viewer_stopped_in(&state, root.path());
    store_a_list_that_does_not_parse(&state);

    let failed = rescan_sync(&WalkTurn::wait(), &state, &mut uninterrupted);

    let message = failed.err().map(|error| error.to_string());
    assert!(
        message.is_some_and(|message| message.contains("Films (lib-owner)")),
        "the scan did not name the library to keep"
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

fn the_owner_saves(state: &SharedState, list: serde_json::Value) {
    state
        .settings
        .set_patch(&state.db, BTreeMap::from([("libraries".to_string(), list)]));
}

#[test]
fn a_null_saved_over_a_list_that_does_not_parse_keeps_the_library_beside_an_environment_folder() {
    let environment = tmp_root("way-out-null-env");
    std::fs::write(environment.path().join("Alien (1979).mkv"), b"x").unwrap();
    let state = test_state_reading(environment.path());
    let root = tmp_root("way-out-null-owner");
    let watched = a_film_the_viewer_stopped_in(&state, root.path());
    store_a_list_that_does_not_parse(&state);
    the_owner_saves(&state, serde_json::Value::Null);

    let _ = rescan_sync(&WalkTurn::wait(), &state, &mut uninterrupted);

    assert_eq!(kept(&state, &watched), (true, Some(RESUME_MS)));
}

#[test]
fn a_null_saved_over_a_list_that_does_not_parse_keeps_the_library_when_the_environment_folder_reads_empty(
) {
    let environment = tmp_root("way-out-null-env-empty");
    let state = test_state_reading(environment.path());
    let root = tmp_root("way-out-null-owner-empty");
    let watched = a_film_the_viewer_stopped_in(&state, root.path());
    store_a_list_that_does_not_parse(&state);
    the_owner_saves(&state, serde_json::Value::Null);

    let _ = rescan_sync(&WalkTurn::wait(), &state, &mut uninterrupted);

    assert_eq!(kept(&state, &watched), (true, Some(RESUME_MS)));
}

#[test]
fn a_null_saved_over_a_list_that_does_not_parse_keeps_the_library_with_no_environment_folder() {
    let state = test_state();
    let root = tmp_root("way-out-null-demo");
    let watched = a_film_the_viewer_stopped_in(&state, root.path());
    store_a_list_that_does_not_parse(&state);
    the_owner_saves(&state, serde_json::Value::Null);

    let _ = rescan_sync(&WalkTurn::wait(), &state, &mut uninterrupted);

    assert_eq!(kept(&state, &watched), (true, Some(RESUME_MS)));
}

#[test]
fn an_empty_list_saved_over_a_list_that_does_not_parse_keeps_the_library() {
    let state = test_state();
    let root = tmp_root("way-out-empty");
    let watched = a_film_the_viewer_stopped_in(&state, root.path());
    store_a_list_that_does_not_parse(&state);
    the_owner_saves(&state, serde_json::json!([]));

    let _ = rescan_sync(&WalkTurn::wait(), &state, &mut uninterrupted);

    assert_eq!(kept(&state, &watched), (true, Some(RESUME_MS)));
}

#[test]
fn the_same_folder_saved_again_under_a_new_id_keeps_the_resume_position() {
    let state = test_state();
    let root = tmp_root("way-out-new-id");
    let watched = a_film_the_viewer_stopped_in(&state, root.path());
    store_a_list_that_does_not_parse(&state);
    the_owner_saves(
        &state,
        serde_json::json!([{
            "id": "lib-saved-again",
            "name": "Films",
            "kind": "movies",
            "folders": [root.path().to_string_lossy()],
        }]),
    );

    let _ = rescan_sync(&WalkTurn::wait(), &state, &mut uninterrupted);

    let titles = db::list_items(&state.db, None).unwrap().len();
    assert_eq!((titles, kept(&state, &watched).1), (1, Some(RESUME_MS)));
}

#[test]
fn the_same_list_saved_again_with_its_ids_is_the_way_out_and_keeps_the_library() {
    let state = test_state();
    let root = tmp_root("way-out-same-id");
    let watched = a_film_the_viewer_stopped_in(&state, root.path());
    store_a_list_that_does_not_parse(&state);
    the_owner_saves(
        &state,
        serde_json::to_value([owner_library(root.path())]).unwrap(),
    );

    let _ = rescan_sync(&WalkTurn::wait(), &state, &mut uninterrupted);

    assert_eq!(kept(&state, &watched), (true, Some(RESUME_MS)));
}

#[test]
fn a_restored_backup_whose_list_does_not_parse_keeps_the_library() {
    let environment = tmp_root("backup-env");
    std::fs::write(environment.path().join("Alien (1979).mkv"), b"x").unwrap();
    let state = test_state_reading(environment.path());
    let root = tmp_root("backup-owner");
    let watched = a_film_the_viewer_stopped_in(&state, root.path());
    let row = serde_json::json!({
        "key": "libraries",
        "value": "[{\"name\":\"Films\"}]",
        "updated_at": "t",
    });
    let doc = db::BackupDoc {
        version: 1,
        exported_at: "t".into(),
        tables: BTreeMap::from([(
            "settings".to_string(),
            vec![row.as_object().unwrap().clone()],
        )]),
        assets: BTreeMap::new(),
        modules: BTreeMap::new(),
    };
    db::import_portable(&state.db, &state.config.data_dir, &doc, false).unwrap();
    state.settings.reload(&state.db);

    let scanned = rescan_sync(&WalkTurn::wait(), &state, &mut uninterrupted);

    assert!(scanned.is_err());
    assert_eq!(kept(&state, &watched), (true, Some(RESUME_MS)));
}
