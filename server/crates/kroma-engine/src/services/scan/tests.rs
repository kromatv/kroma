use super::*;
use crate::model::{Kind, LibraryKind};
use kroma_testing::TempDir;

mod rescan;
mod stored_list;
mod unread;

// A fresh, empty temp directory for one test.
fn tmp_root(tag: &str) -> TempDir {
    kroma_testing::temp_dir(&format!("scanall-{tag}"))
}

fn def(id: &str, name: &str, kind: &str, folders: Vec<String>) -> LibraryDef {
    LibraryDef {
        id: id.into(),
        name: name.into(),
        kind: kind.into(),
        folders,
        auto_scan: true,
    }
}

#[test]
fn scan_all_with_no_defs_is_empty() {
    let data = scan_all(&[]);
    assert!(data.libraries.is_empty());
    assert!(data.items.is_empty());
    assert!(data.shows.is_empty());
    assert!(data.mtimes.is_empty());
}

#[test]
fn scan_all_auto_detects_movies_and_counts_items() {
    let root_dir = tmp_root("movies");
    let root = root_dir.path();
    let folder = root.to_string_lossy().into_owned();
    std::fs::write(root.join("The Matrix (1999).mkv"), b"x").unwrap();
    std::fs::write(root.join("Heat (1995).mkv"), b"x").unwrap();

    let data = scan_all(&[def("lib1", "Films", "", vec![folder.clone()])]);
    assert_eq!(data.libraries.len(), 1);
    let lib = &data.libraries[0];
    assert_eq!(lib.id, "lib1");
    assert_eq!(lib.name, "Films");
    assert_eq!(lib.kind, LibraryKind::Movies);
    assert_eq!(lib.item_count, 2);
    assert_eq!(lib.path, folder);
    assert_eq!(data.items.len(), 2);
    assert!(data.shows.is_empty());
    assert_eq!(data.mtimes.len(), 2, "one mtime recorded per scanned file");
    assert!(data
        .items
        .iter()
        .all(|i| i.kind == Kind::Movie && i.library == "lib1"));
}

#[test]
fn scan_all_auto_detects_shows_from_episodes() {
    let root_dir = tmp_root("shows");
    let root = root_dir.path();
    let show = root.join("Breaking Bad");
    std::fs::create_dir_all(&show).unwrap();
    std::fs::write(show.join("Breaking Bad S01E01.mkv"), b"x").unwrap();
    std::fs::write(show.join("Breaking Bad S01E02.mkv"), b"x").unwrap();

    let data = scan_all(&[def(
        "lib2",
        "Series",
        "",
        vec![root.to_string_lossy().into_owned()],
    )]);
    assert_eq!(data.libraries[0].kind, LibraryKind::Shows);
    assert_eq!(data.shows.len(), 1);
    assert_eq!(data.items.len(), 2);
    assert!(data.items.iter().all(|i| i.kind == Kind::Episode));
}

#[test]
fn scan_all_auto_detects_mixed_content() {
    let root_dir = tmp_root("mixed");
    let root = root_dir.path();
    std::fs::write(root.join("Heat (1995).mkv"), b"x").unwrap();
    let show = root.join("The Office");
    std::fs::create_dir_all(&show).unwrap();
    std::fs::write(show.join("The Office S01E01.mkv"), b"x").unwrap();

    let data = scan_all(&[def(
        "lib3",
        "Mixed",
        "",
        vec![root.to_string_lossy().into_owned()],
    )]);
    assert_eq!(data.libraries[0].kind, LibraryKind::Mixed);
}

#[test]
fn scan_all_pinned_kind_overrides_detection() {
    let root_dir = tmp_root("pinned");
    let root = root_dir.path();
    // Contents look like a movie, but the def pins the library to "shows".
    std::fs::write(root.join("Heat (1995).mkv"), b"x").unwrap();

    let data = scan_all(&[def(
        "lib4",
        "Pinned",
        "shows",
        vec![root.to_string_lossy().into_owned()],
    )]);
    assert_eq!(data.libraries[0].kind, LibraryKind::Shows);
}

#[test]
fn scan_all_skips_a_missing_folder_but_still_lists_the_library() {
    let base_dir = tmp_root("missing");
    let base = base_dir.path();
    let absent = base.join("does-not-exist");
    let data = scan_all(&[def(
        "lib5",
        "Ghost",
        "",
        vec![absent.to_string_lossy().into_owned()],
    )]);
    // The (empty) library row is still produced; no items and no crash.
    assert_eq!(data.libraries.len(), 1);
    assert_eq!(data.libraries[0].item_count, 0);
    assert!(data.items.is_empty());
    // No content -> auto-detect degenerates to Movies.
    assert_eq!(data.libraries[0].kind, LibraryKind::Movies);
}

#[test]
fn scan_all_multi_folder_library_shares_id_and_aggregates() {
    let a_dir = tmp_root("multi-a");
    let a = a_dir.path();
    let b_dir = tmp_root("multi-b");
    let b = b_dir.path();
    std::fs::write(a.join("Heat (1995).mkv"), b"x").unwrap();
    std::fs::write(b.join("Dune (2021).mkv"), b"x").unwrap();

    let data = scan_all(&[def(
        "lib6",
        "Split",
        "movies",
        vec![
            a.to_string_lossy().into_owned(),
            b.to_string_lossy().into_owned(),
        ],
    )]);
    assert_eq!(data.libraries.len(), 1);
    // Both folders' items count toward the one library.
    assert_eq!(data.libraries[0].item_count, 2);
    assert!(
        data.libraries[0].path.contains(", "),
        "path lists both folders"
    );
    assert_eq!(data.items.len(), 2);
    assert!(data.items.iter().all(|i| i.library == "lib6"));
}
