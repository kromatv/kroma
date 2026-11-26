use std::path::Path;
use std::sync::mpsc::RecvTimeoutError;
use std::time::Duration;

use super::signature;
use super::watched::Watched;
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
    signature(&scan_all(&library(root)))
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

#[test]
fn a_poster_put_beside_a_show_changes_the_signature() {
    let root = kroma_testing::temp_dir("watch-poster");
    put(root.path(), "Show/Season 1/Show S01E01.mkv", b"one");
    let before = signed(root.path());

    put(root.path(), "Show/poster.jpg", b"poster");

    assert_ne!(signed(root.path()), before);
}

#[test]
fn an_nfo_put_beside_a_show_or_edited_changes_the_signature() {
    let root = kroma_testing::temp_dir("watch-nfo");
    put(root.path(), "Show/Season 1/Show S01E01.mkv", b"one");
    let before = signed(root.path());

    put(root.path(), "Show/tvshow.nfo", b"<tvshow/>");
    let put_beside = signed(root.path());
    let nfo = std::fs::File::options()
        .write(true)
        .open(root.path().join("Show/tvshow.nfo"))
        .unwrap();
    nfo.set_modified(std::time::UNIX_EPOCH).unwrap();

    assert_ne!(put_beside, before);
    assert_ne!(signed(root.path()), put_beside);
}

fn watching(root: &Path) -> Watched {
    let watched = Watched::start(vec![root.to_path_buf()]);
    assert!(watched.fs_events());
    watched
}

fn stays_asleep(watched: &Watched) -> bool {
    watched.rx.recv_timeout(Duration::from_millis(500)) == Err(RecvTimeoutError::Timeout)
}

fn wakes(watched: &Watched) -> bool {
    watched.rx.recv_timeout(Duration::from_secs(5)).is_ok()
}

#[test]
fn walking_the_library_or_reading_a_video_does_not_wake_the_watcher() {
    let root = kroma_testing::temp_dir("watch-own-walk");
    put(root.path(), "Show/Season 1/Show S01E01.mkv", b"one");
    put(root.path(), "Show/tvshow.nfo", b"<tvshow/>");
    let watched = watching(root.path());

    signed(root.path());
    std::fs::read(root.path().join("Show/Season 1/Show S01E01.mkv")).unwrap();

    assert!(stays_asleep(&watched));
}

#[test]
fn a_file_added_to_a_watched_folder_wakes_the_watcher() {
    let root = kroma_testing::temp_dir("watch-added");
    put(root.path(), "Show/Season 1/Show S01E01.mkv", b"one");
    let watched = watching(root.path());

    put(root.path(), "Show/Season 1/Show S01E02.mkv", b"two");

    assert!(wakes(&watched));
}

#[test]
fn a_file_the_nas_writes_in_its_eadir_folder_does_not_wake_the_watcher() {
    let root = kroma_testing::temp_dir("watch-eadir");
    put(
        root.path(),
        "Show/Season 1/@eaDir/Show S01E01.mkv/SYNOVIDEO_VIDEO_SCREENSHOT.jpg",
        b"jpg",
    );
    let watched = watching(root.path());

    put(
        root.path(),
        "Show/Season 1/@eaDir/Show S01E01.mkv/SYNOINDEX_MEDIA_INFO",
        b"info",
    );

    assert!(stays_asleep(&watched));
}

#[test]
fn a_file_added_to_a_folder_made_after_the_watcher_started_wakes_it() {
    let root = kroma_testing::temp_dir("watch-new-folder");
    let mut watched = watching(root.path());
    std::fs::create_dir_all(root.path().join("New Show/Season 1")).unwrap();
    while !stays_asleep(&watched) {}

    watched.refresh();
    put(root.path(), "New Show/Season 1/New Show S01E01.mkv", b"one");

    assert!(wakes(&watched));
}
