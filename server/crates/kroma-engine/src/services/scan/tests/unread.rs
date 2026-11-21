use std::path::{Path, PathBuf};

use super::super::*;
use super::{def, tmp_root};
use crate::services::settings::set_library_defs;
use crate::state::SharedState;
use crate::test_support::test_state;

struct Mounts {
    _films: kroma_testing::TempDir,
    _share: kroma_testing::TempDir,
    share: PathBuf,
}

fn mount_with(films: &[&str]) -> (kroma_testing::TempDir, PathBuf) {
    let root = tmp_root("unread");
    let mount = root.path().join("mount");
    std::fs::create_dir_all(&mount).unwrap();
    for film in films {
        std::fs::write(mount.join(format!("{film}.mkv")), b"x").unwrap();
    }
    (root, mount)
}

fn folder(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn scanned_once(state: &SharedState, share_films: &[&str]) -> Mounts {
    let (films_root, films) = mount_with(&["Alien (1979)"]);
    let (share_root, share) = mount_with(share_films);
    set_library_defs(
        &state.settings,
        &state.db,
        &[
            def("films", "Films", "movies", vec![folder(&films)]),
            def("share", "Share", "movies", vec![folder(&share)]),
        ],
    );
    rescan(state);
    Mounts {
        _films: films_root,
        _share: share_root,
        share,
    }
}

fn rescan(state: &SharedState) -> Scanned {
    rescan_sync(&WalkTurn::wait(), state, &mut uninterrupted).unwrap()
}

fn titles(state: &SharedState) -> Vec<String> {
    crate::db::list_movies(&state.db, None)
        .unwrap()
        .into_iter()
        .map(|item| item.title)
        .collect()
}

fn stored_titles(state: &SharedState) -> i64 {
    state
        .db
        .get()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0))
        .unwrap()
}

fn resume_a_share_film(state: &SharedState) {
    let user = crate::db::create_user(&state.db, "ana@test.dev", "Ana", "h", &[]).unwrap();
    let item: String = state
        .db
        .get()
        .unwrap()
        .query_row("SELECT id FROM items WHERE library = 'share'", [], |r| {
            r.get(0)
        })
        .unwrap();
    crate::db::save_progress(&state.db, &user.id, &item, 60_000, Some(7_200_000), 90).unwrap();
}

fn resume_positions(state: &SharedState) -> i64 {
    state
        .db
        .get()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM progress", [], |r| r.get(0))
        .unwrap()
}

#[test]
fn a_share_that_drops_while_another_library_still_reads_keeps_its_titles_and_their_progress() {
    let state = test_state();
    let mounts = scanned_once(&state, &["Dune (2021)"]);
    resume_a_share_film(&state);
    std::fs::remove_dir_all(&mounts.share).unwrap();

    let scanned = rescan(&state);

    assert!(matches!(scanned, Scanned::Applied(_)));
    assert_eq!(titles(&state), ["Alien", "Dune"]);
    assert_eq!(resume_positions(&state), 1);
}

#[test]
fn a_file_deleted_from_a_library_that_reads_leaves_its_title_absent() {
    let state = test_state();
    let mounts = scanned_once(&state, &["Dune (2021)", "Heat (1995)"]);
    std::fs::remove_file(mounts.share.join("Heat (1995).mkv")).unwrap();

    rescan(&state);

    assert_eq!(titles(&state), ["Alien", "Dune"]);
    assert_eq!(stored_titles(&state), 3);
}

#[test]
fn an_empty_mount_point_keeps_its_titles_and_their_progress() {
    let state = test_state();
    let mounts = scanned_once(&state, &["Dune (2021)"]);
    resume_a_share_film(&state);
    std::fs::remove_file(mounts.share.join("Dune (2021).mkv")).unwrap();

    rescan(&state);

    assert_eq!(titles(&state), ["Alien", "Dune"]);
    assert_eq!(resume_positions(&state), 1);
}

#[test]
fn one_empty_folder_of_a_library_that_still_reads_keeps_its_titles() {
    let state = test_state();
    let (_local_root, local) = mount_with(&["Alien (1979)"]);
    let (_share_root, share) = mount_with(&["Dune (2021)"]);
    set_library_defs(
        &state.settings,
        &state.db,
        &[def(
            "films",
            "Films",
            "movies",
            vec![folder(&local), folder(&share)],
        )],
    );
    rescan(&state);
    std::fs::remove_file(share.join("Dune (2021).mkv")).unwrap();

    rescan(&state);

    assert_eq!(titles(&state), ["Alien", "Dune"]);
}

#[test]
fn a_library_holding_a_link_whose_target_is_gone_prunes_nothing() {
    let state = test_state();
    let mounts = scanned_once(&state, &["Dune (2021)", "Heat (1995)"]);
    std::os::unix::fs::symlink(
        "/nowhere/Gone (2014).mkv",
        mounts.share.join("Gone (2014).mkv"),
    )
    .unwrap();
    std::fs::remove_file(mounts.share.join("Heat (1995).mkv")).unwrap();

    rescan(&state);

    assert_eq!(titles(&state), ["Alien", "Dune", "Heat"]);
}

#[test]
fn a_file_put_back_brings_its_title_back_with_its_progress() {
    let state = test_state();
    let mounts = scanned_once(&state, &["Dune (2021)", "Heat (1995)"]);
    resume_a_share_film(&state);
    let dune = mounts.share.join("Dune (2021).mkv");
    let aside = mounts.share.join("Dune (2021).mkv.moved");
    std::fs::rename(&dune, &aside).unwrap();
    rescan(&state);
    let while_gone = titles(&state);

    std::fs::rename(&aside, &dune).unwrap();
    rescan(&state);

    assert_eq!(while_gone, ["Alien", "Heat"]);
    assert_eq!(titles(&state), ["Alien", "Dune", "Heat"]);
    assert_eq!(resume_positions(&state), 1);
}
