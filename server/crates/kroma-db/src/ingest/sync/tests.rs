use super::*;
use crate::ingest::test_support::*;
use crate::{
    item_has_probed_file, item_probed, set_file_probe, set_item_metadata, unprobed_files, FileProbe,
};

mod absent;
mod batches;
mod held;

#[test]
fn sync_all_creates_updates_and_marks_what_it_did_not_find_absent() {
    let p = pool();
    let items = vec![
        movie(
            "m1",
            "Dune",
            "lib",
            vec![file("f1", "/media/m1.mkv", false)],
        ),
        movie(
            "m2",
            "Arrival",
            "lib",
            vec![file("f2", "/media/m2.mkv", false)],
        ),
    ];
    sync_all(&p, &[lib("lib")], &[], &items, &mtimes_of(&items, 100)).unwrap();
    assert_eq!(crate::counts(&p).unwrap(), (1, 2, 0));
    let got = crate::get_item(&p, "m1").unwrap().unwrap();
    assert_eq!(got.files.len(), 1);
    assert_eq!(got.container, "mkv"); // seeded from the file until a probe recomputes

    let mut unprobed = unprobed_files(&p).unwrap();
    unprobed.sort();
    assert_eq!(unprobed.len(), 2);
    assert!(unprobed
        .iter()
        .any(|(id, abs, item)| id == "f1" && abs == "/media/m1.mkv" && item == "m1"));

    let items = vec![movie(
        "m1",
        "Dune",
        "lib",
        vec![file("f1", "/media/m1.mkv", false)],
    )];
    sync_all(&p, &[lib("lib")], &[], &items, &mtimes_of(&items, 100)).unwrap();
    assert_eq!(crate::counts(&p).unwrap(), (1, 1, 0));
    assert!(crate::get_item(&p, "m2").unwrap().unwrap().files.is_empty());
}

#[test]
fn sync_preserves_metadata_and_probe_across_rescans() {
    let p = pool();
    let items = vec![movie(
        "m1",
        "Dune",
        "lib",
        vec![file("f1", "/media/m1.mkv", false)],
    )];
    sync_all(&p, &[lib("lib")], &[], &items, &mtimes_of(&items, 100)).unwrap();

    set_file_probe(
        &p,
        "f1",
        &FileProbe {
            duration_ms: Some(7_200_000),
            video: Some(&video()),
            ..FileProbe::default()
        },
    )
    .unwrap();
    set_item_metadata(&p, "m1", &meta(603, "Dune")).unwrap();
    assert!(item_has_probed_file(&p, "m1").unwrap());

    sync_all(&p, &[lib("lib")], &[], &items, &mtimes_of(&items, 100)).unwrap();
    assert!(
        item_probed(&p, "m1").unwrap(),
        "unchanged file keeps probed=1"
    );
    let got = crate::get_item(&p, "m1").unwrap().unwrap();
    assert_eq!(got.metadata.as_ref().map(|m| m.tmdb_id), Some(603));

    sync_all(&p, &[lib("lib")], &[], &items, &mtimes_of(&items, 999)).unwrap();
    assert!(
        !item_probed(&p, "m1").unwrap(),
        "changed file resets probed=0"
    );
    assert!(crate::get_item(&p, "m1")
        .unwrap()
        .unwrap()
        .metadata
        .is_some());
}

#[test]
fn a_scan_that_cannot_write_an_item_fails_whole_rather_than_half() {
    let p = pool();
    p.get()
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER no_item_insert BEFORE INSERT ON items \
             BEGIN SELECT RAISE(ABORT, 'refused'); END",
        )
        .unwrap();

    let items = vec![movie(
        "m1",
        "Dune",
        "lib",
        vec![file("f1", "/media/m1.mkv", false)],
    )];
    assert!(sync_all(&p, &[lib("lib")], &[], &items, &HashMap::new()).is_err());
}

#[test]
fn every_kind_is_stored_under_the_spelling_the_queries_filter_on() {
    assert_eq!(kind_str(&Kind::Movie), "movie");
    assert_eq!(kind_str(&Kind::Episode), "episode");
    assert_eq!(kind_str(&Kind::Video), "video");

    assert_eq!(library_kind_str(&LibraryKind::Movies), "movies");
    assert_eq!(library_kind_str(&LibraryKind::Shows), "shows");
    assert_eq!(library_kind_str(&LibraryKind::Mixed), "mixed");
}
