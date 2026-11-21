use super::*;
use crate::ingest::test_support::*;
use crate::{metadata_core, store_localized, sync_all};
use std::collections::{HashMap, HashSet};

fn two_libraries() -> crate::testing::TempPool {
    let p = pool();
    let items = vec![
        movie("m1", "Dune", "kept", vec![file("f1", "/a/m1.mkv", false)]),
        movie(
            "m2",
            "Arrival",
            "gone",
            vec![file("f2", "/b/m2.mkv", false)],
        ),
    ];
    sync_all(
        &p,
        &[lib("kept"), lib("gone")],
        &[],
        &items,
        &mtimes_of(&items, 100),
    )
    .unwrap();
    let arrival = meta(329865, "Arrival");
    store_localized(&p, metadata_core::ITEM, "m2", &arrival, &HashMap::new()).unwrap();
    p
}

fn walked_dune() -> [MediaItem; 1] {
    [movie(
        "m1",
        "Dune",
        "kept",
        vec![file("f1", "/a/m1.mkv", false)],
    )]
}

fn file_paths(tx: &rusqlite::Transaction) -> Vec<String> {
    let mut stmt = tx
        .prepare("SELECT abs_path FROM files ORDER BY abs_path")
        .unwrap();
    stmt.query_map([], |r| r.get(0))
        .unwrap()
        .map(Result::unwrap)
        .collect()
}

#[test]
fn a_library_that_is_no_longer_configured_goes_with_its_titles_and_what_they_cached() {
    let p = two_libraries();

    let dropped = drop_unconfigured_libraries(&p, &["kept"]).unwrap();

    assert_eq!(dropped, 1);
    assert_eq!(crate::counts(&p).unwrap(), (1, 1, 0));
    assert!(crate::get_item(&p, "m1").unwrap().is_some());
    assert!(metadata_core::get_core(&p, metadata_core::ITEM, "m2")
        .unwrap()
        .is_none());
}

#[test]
fn libraries_that_are_all_configured_lose_nothing() {
    let p = two_libraries();

    let dropped = drop_unconfigured_libraries(&p, &["kept", "gone"]).unwrap();

    assert_eq!(dropped, 0);
    assert_eq!(crate::counts(&p).unwrap(), (2, 2, 0));
    assert!(metadata_core::get_core(&p, metadata_core::ITEM, "m2")
        .unwrap()
        .is_some());
}

#[test]
fn a_walk_removes_the_files_it_did_not_find_in_a_library_it_read() {
    let p = two_libraries();
    let mut conn = p.get().unwrap();
    let tx = conn.transaction().unwrap();

    delete_gone_files(&tx, &walked_dune(), &HashSet::new()).unwrap();

    assert_eq!(file_paths(&tx), ["/a/m1.mkv"]);
}

#[test]
fn a_walk_keeps_the_files_of_a_library_it_did_not_read_whole() {
    let p = two_libraries();
    let mut conn = p.get().unwrap();
    let tx = conn.transaction().unwrap();
    let unread = HashSet::from(["gone".to_string()]);

    delete_gone_files(&tx, &walked_dune(), &unread).unwrap();

    assert_eq!(file_paths(&tx), ["/a/m1.mkv", "/b/m2.mkv"]);
}
