use std::path::Path;

use super::super::{rescan_sync, scan_all, uninterrupted, ScanData, Scanned, WalkTurn};
use super::HeldEpisodes;
use crate::model::Show;
use crate::services::settings::{set_library_defs, LibraryDef};
use crate::state::SharedState;
use crate::test_support::test_state;

fn tmp_root(tag: &str) -> kroma_testing::TempDir {
    kroma_testing::temp_dir(&format!("changed-shows-{tag}"))
}

fn configured_library(dir: &Path) -> LibraryDef {
    LibraryDef {
        id: "lib-1".into(),
        name: "Films".into(),
        kind: "mixed".into(),
        folders: vec![dir.to_string_lossy().into_owned()],
        auto_scan: true,
    }
}

fn episode(root: &Path, show: &str, season: u32, number: u32) {
    let dir = root.join(show);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join(format!("{show} S{season:02}E{number:02}.mkv")), b"x").unwrap();
}

fn walked(state: &SharedState) -> ScanData {
    let defs = crate::services::settings::library_defs(&state.settings, &state.config).unwrap();
    let mut data = scan_all(&defs);
    HeldEpisodes::read(&state.db).note_changed(&mut data);
    data
}

fn indexed(state: &SharedState, root: &Path) {
    set_library_defs(&state.settings, &state.db, &[configured_library(root)]);
    let scanned = rescan_sync(&WalkTurn::wait(), state, &mut uninterrupted).unwrap();
    assert!(matches!(scanned, Scanned::Applied(_)));
}

#[test]
fn a_scan_that_adds_a_film_moves_no_shows_episodes() {
    let state = test_state();
    let root = tmp_root("film");
    episode(root.path(), "Breaking Bad", 1, 1);
    indexed(&state, root.path());
    std::fs::write(root.path().join("Heat (1995).mkv"), b"x").unwrap();

    let again = walked(&state);

    assert!(again.changed_shows.is_empty(), "{:?}", again.changed_shows);
}

#[test]
fn a_scan_that_adds_an_episode_moves_only_the_show_it_belongs_to() {
    let state = test_state();
    let root = tmp_root("episode");
    episode(root.path(), "Breaking Bad", 1, 1);
    episode(root.path(), "The Office", 1, 1);
    indexed(&state, root.path());
    episode(root.path(), "Breaking Bad", 1, 2);

    let again = walked(&state);

    let moved: Vec<&Show> = again
        .shows
        .iter()
        .filter(|s| again.changed_shows.contains(&s.id))
        .collect();
    assert_eq!(moved.len(), 1, "{:?}", again.changed_shows);
    assert_eq!(moved[0].title, "Breaking Bad");
}

#[test]
fn a_scan_that_loses_an_episode_moves_its_show_too() {
    let state = test_state();
    let root = tmp_root("removed");
    episode(root.path(), "Breaking Bad", 1, 1);
    episode(root.path(), "Breaking Bad", 1, 2);
    indexed(&state, root.path());
    std::fs::remove_file(root.path().join("Breaking Bad/Breaking Bad S01E02.mkv")).unwrap();

    let again = walked(&state);

    assert_eq!(again.changed_shows.len(), 1);
}

fn scanned(state: &SharedState) -> ScanData {
    match rescan_sync(&WalkTurn::wait(), state, &mut uninterrupted).unwrap() {
        Scanned::Applied(data) => data,
        _ => panic!("the scan was not applied"),
    }
}

#[test]
fn shows_held_twice_are_reported_by_the_next_walk_and_then_forgotten() {
    let state = test_state();
    let root = tmp_root("held-twice");
    episode(root.path(), "Breaking Bad", 1, 1);
    episode(root.path(), "The Office", 1, 1);
    set_library_defs(
        &state.settings,
        &state.db,
        &[configured_library(root.path())],
    );
    let first = scanned(&state);
    super::super::hold_changed_shows(&state, &first).unwrap();
    super::super::hold_changed_shows(&state, &first).unwrap();
    let held = crate::db::unsettled_shows(&state.db).unwrap();

    let second = scanned(&state);
    super::super::hold_changed_shows(&state, &second).unwrap();
    let third = scanned(&state);
    let fourth = scanned(&state);

    assert_eq!(held.len(), 2);
    assert_eq!(second.changed_shows, held);
    assert_eq!(third.changed_shows, held);
    assert!(fourth.changed_shows.is_empty());
    assert!(crate::db::unsettled_shows(&state.db).unwrap().is_empty());
}

#[test]
fn a_held_show_that_left_the_folder_is_forgotten_by_the_next_walk() {
    let state = test_state();
    let root = tmp_root("held-gone");
    episode(root.path(), "Breaking Bad", 1, 1);
    std::fs::write(root.path().join("Heat (1995).mkv"), b"x").unwrap();
    set_library_defs(
        &state.settings,
        &state.db,
        &[configured_library(root.path())],
    );
    let first = scanned(&state);
    super::super::hold_changed_shows(&state, &first).unwrap();
    std::fs::remove_dir_all(root.path().join("Breaking Bad")).unwrap();

    let second = scanned(&state);

    assert_eq!(first.changed_shows.len(), 1);
    assert!(second.changed_shows.is_empty());
    assert!(crate::db::unsettled_shows(&state.db).unwrap().is_empty());
}

#[test]
fn shows_held_while_another_walk_runs_reach_a_later_walk() {
    let state = test_state();
    let root = tmp_root("held-during");
    episode(root.path(), "Breaking Bad", 1, 1);
    set_library_defs(
        &state.settings,
        &state.db,
        &[configured_library(root.path())],
    );
    let first = scanned(&state);
    let mut held_late = false;

    let second = rescan_sync(&WalkTurn::wait(), &state, &mut |_| {
        if !held_late {
            super::super::hold_changed_shows(&state, &first).unwrap();
            held_late = true;
        }
        std::ops::ControlFlow::Continue(())
    })
    .unwrap();
    let third = scanned(&state);

    let reported = match second {
        Scanned::Applied(data) => data.changed_shows.len(),
        _ => panic!("the scan was not applied"),
    } + third.changed_shows.len();
    assert_eq!((first.changed_shows.len(), reported), (1, 1));
}

#[test]
fn a_first_scan_moves_every_show_it_finds() {
    let state = test_state();
    let root = tmp_root("first");
    episode(root.path(), "Breaking Bad", 1, 1);
    set_library_defs(
        &state.settings,
        &state.db,
        &[configured_library(root.path())],
    );

    let first = walked(&state);

    assert_eq!(first.changed_shows.len(), 1);
}
