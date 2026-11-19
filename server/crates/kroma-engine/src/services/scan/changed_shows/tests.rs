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
