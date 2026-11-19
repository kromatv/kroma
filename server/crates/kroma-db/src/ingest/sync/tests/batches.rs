use super::super::*;
use crate::ingest::test_support::*;
use crate::{item_probed, set_file_probe, set_item_metadata, FileProbe};

fn dune() -> MediaItem {
    movie(
        "m1",
        "Dune",
        "lib",
        vec![file("f1", "/media/m1.mkv", false)],
    )
}

fn arrival() -> MediaItem {
    movie(
        "m2",
        "Arrival",
        "lib",
        vec![file("f2", "/media/m2.mkv", false)],
    )
}

fn write_batch(p: &Pool, library: &Library, items: &[MediaItem]) -> Result<usize> {
    let items: Vec<&MediaItem> = items.iter().collect();
    let mtimes = items
        .iter()
        .flat_map(|i| i.files.iter())
        .map(|f| (f.id.clone(), Some(100)))
        .collect();
    sync_batch(
        p,
        &ScanBatch {
            library,
            shows: &[],
            items: &items,
            mtimes: &mtimes,
        },
    )
}

fn stored_kind(p: &Pool, library: &str) -> String {
    p.get()
        .unwrap()
        .query_row("SELECT kind FROM libraries WHERE id = ?1", [library], |r| {
            r.get(0)
        })
        .unwrap()
}

#[test]
fn a_batch_is_in_the_catalogue_before_the_next_one_is_written() {
    let p = pool();

    let written = write_batch(&p, &lib("lib"), &[dune()]).unwrap();

    assert_eq!(written, 3);
    assert_eq!(crate::counts(&p).unwrap(), (1, 1, 0));
    assert_eq!(crate::get_item(&p, "m1").unwrap().unwrap().files.len(), 1);
    assert!(crate::get_item(&p, "m2").unwrap().is_none());

    write_batch(&p, &lib("lib"), &[arrival()]).unwrap();

    assert_eq!(crate::counts(&p).unwrap(), (1, 2, 0));
}

#[test]
fn a_batch_removes_nothing_the_walk_has_not_reached_yet() {
    let p = pool();
    let stored = vec![dune(), arrival()];
    sync_all(&p, &[lib("lib")], &[], &stored, &mtimes_of(&stored, 100)).unwrap();

    write_batch(&p, &lib("lib"), &[dune()]).unwrap();

    assert!(crate::get_item(&p, "m2").unwrap().is_some());
}

#[test]
fn a_batch_the_database_already_holds_writes_no_row_and_keeps_what_was_probed() {
    let p = pool();
    write_batch(&p, &lib("lib"), &[dune()]).unwrap();
    let unprobed_again = write_batch(&p, &lib("lib"), &[dune()]).unwrap();
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

    let probed_again = write_batch(&p, &lib("lib"), &[dune()]).unwrap();

    assert_eq!((unprobed_again, probed_again), (0, 0));
    assert!(item_probed(&p, "m1").unwrap());
    let kept = crate::get_item(&p, "m1").unwrap().unwrap();
    assert_eq!(kept.metadata.as_ref().map(|m| m.tmdb_id), Some(603));
}

#[test]
fn a_batch_that_brings_one_more_file_for_a_stored_title_writes_only_that_file() {
    let p = pool();
    write_batch(&p, &lib("lib"), &[dune()]).unwrap();
    let mut two_cuts = dune();
    two_cuts
        .files
        .push(file("f1-4k", "/media/m1 - 4K.mkv", false));

    let written = write_batch(&p, &lib("lib"), &[two_cuts]).unwrap();

    assert_eq!(written, 1);
    assert_eq!(crate::get_item(&p, "m1").unwrap().unwrap().files.len(), 2);
}

#[test]
fn a_batch_resets_a_file_that_was_sent_back_for_a_probe() {
    let p = pool();
    write_batch(&p, &lib("lib"), &[dune()]).unwrap();
    set_file_probe(
        &p,
        "f1",
        &FileProbe {
            duration_ms: Some(7_200_000),
            ..FileProbe::default()
        },
    )
    .unwrap();
    crate::unprobe_item_files(&p, "m1").unwrap();

    let written = write_batch(&p, &lib("lib"), &[dune()]).unwrap();

    assert_eq!(written, 1);
    let duration: Option<i64> = p
        .get()
        .unwrap()
        .query_row("SELECT duration_ms FROM files WHERE id = 'f1'", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(duration, None);
}

#[test]
fn a_batch_that_cannot_write_a_file_leaves_none_of_its_rows() {
    let p = pool();
    p.get()
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER no_file_insert BEFORE INSERT ON files \
             BEGIN SELECT RAISE(ABORT, 'refused'); END",
        )
        .unwrap();

    let refused = write_batch(&p, &lib("lib"), &[dune()]);

    assert!(refused.is_err());
    assert_eq!(crate::counts(&p).unwrap(), (0, 0, 0));
}

#[test]
fn a_stored_library_keeps_its_row_until_the_walk_ends() {
    let p = pool();
    let mixed = Library {
        kind: LibraryKind::Mixed,
        ..lib("lib")
    };
    write_batch(&p, &mixed, &[dune()]).unwrap();

    let films_so_far = write_batch(&p, &lib("lib"), &[dune()]).unwrap();

    assert_eq!(films_so_far, 0);
    assert_eq!(stored_kind(&p, "lib"), "mixed");

    finish_sync(&p, &[lib("lib")], &[dune()], &HashSet::new()).unwrap();

    assert_eq!(stored_kind(&p, "lib"), "movies");
}

#[test]
fn finishing_a_walk_removes_the_files_titles_and_libraries_it_did_not_find() {
    let p = pool();
    let stored = vec![dune(), arrival()];
    sync_all(
        &p,
        &[lib("lib"), lib("gone")],
        &[],
        &stored,
        &mtimes_of(&stored, 100),
    )
    .unwrap();
    write_batch(&p, &lib("lib"), &[dune()]).unwrap();

    finish_sync(&p, &[lib("lib")], &[dune()], &HashSet::new()).unwrap();

    assert_eq!(crate::counts(&p).unwrap(), (1, 1, 0));
    assert!(crate::get_item(&p, "m1").unwrap().is_some());
    assert!(crate::get_item(&p, "m2").unwrap().is_none());
}

#[test]
fn a_show_a_batch_brings_again_is_written_only_when_its_year_was_missing() {
    let p = pool();
    let undated = show("s1", "lib");
    let dated = Show {
        year: Some(2022),
        ..undated.clone()
    };
    let batch = |show: &Show| {
        sync_batch(
            &p,
            &ScanBatch {
                library: &lib("lib"),
                shows: &[show],
                items: &[],
                mtimes: &HashMap::new(),
            },
        )
        .unwrap()
    };

    let written = [
        batch(&undated),
        batch(&undated),
        batch(&dated),
        batch(&undated),
    ];

    assert_eq!(written, [2, 0, 1, 0]);
}
