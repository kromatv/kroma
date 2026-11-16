use std::path::Path;

use super::signature;
use crate::services::scan::scan_all;
use crate::services::settings::LibraryDef;

fn library(root: &Path) -> Vec<LibraryDef> {
    vec![LibraryDef {
        id: "series".into(),
        name: "Series".into(),
        kind: "shows".into(),
        folders: vec![root.to_string_lossy().into_owned()],
        auto_scan: true,
    }]
}

fn put(root: &Path, rel: &str, bytes: &[u8]) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, bytes).unwrap();
}

fn signed(root: &Path) -> u64 {
    let data = scan_all(&library(root));
    signature(&data.items, &data.mtimes)
}

#[test]
fn the_same_files_sign_the_same_on_every_walk() {
    let root = kroma_testing::temp_dir("watch-same");
    put(root.path(), "Show/Season 1/Show S01E01.mkv", b"one");
    put(root.path(), "Show/Season 1/Show S01E02.mkv", b"two!");

    let first = signed(root.path());

    assert_eq!(signed(root.path()), first);
}

#[test]
fn a_file_moved_to_another_folder_changes_the_signature() {
    let root = kroma_testing::temp_dir("watch-moved");
    put(
        root.path(),
        "New Name (2022)/Season 03/Show S03E01.mkv",
        b"episode",
    );
    let before = signed(root.path());

    std::fs::create_dir_all(root.path().join("Show/Season 3")).unwrap();
    std::fs::rename(
        root.path()
            .join("New Name (2022)/Season 03/Show S03E01.mkv"),
        root.path().join("Show/Season 3/Show S03E01.mkv"),
    )
    .unwrap();

    assert_ne!(signed(root.path()), before);
}

#[test]
fn two_files_trading_names_change_the_signature() {
    let root = kroma_testing::temp_dir("watch-swapped");
    put(root.path(), "Show/Season 1/Show S01E01.mkv", b"first");
    put(
        root.path(),
        "Show/Season 1/Show S01E02.mkv",
        b"second episode",
    );
    let before = signed(root.path());
    let dir = root.path().join("Show/Season 1");

    std::fs::rename(dir.join("Show S01E01.mkv"), dir.join("swap.mkv")).unwrap();
    std::fs::rename(dir.join("Show S01E02.mkv"), dir.join("Show S01E01.mkv")).unwrap();
    std::fs::rename(dir.join("swap.mkv"), dir.join("Show S01E02.mkv")).unwrap();

    assert_ne!(signed(root.path()), before);
}
