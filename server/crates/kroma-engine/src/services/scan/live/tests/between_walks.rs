use std::ops::ControlFlow;
use std::path::Path;
use std::time::Duration;

use super::super::*;
use super::{library, three_films, titles, ONE_FILE};
use crate::model::Permission;
use crate::services::scan::rescan_sync;
use crate::services::settings::set_library_defs;
use crate::state::SharedState;
use crate::test_support::test_state;

const OVERLAP_GRACE: Duration = Duration::from_millis(250);

fn library_named(id: &str, root: &Path) -> LibraryDef {
    LibraryDef {
        id: id.into(),
        ..library(root).remove(0)
    }
}

fn synced(walked: Walked) -> ScanData {
    match walked {
        Walked::Synced(data) => data,
        Walked::Empty { .. } | Walked::Stopped => panic!("expected the walk to read every folder"),
    }
}

fn file_rows(state: &SharedState) -> i64 {
    state
        .db
        .get()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0))
        .unwrap()
}

#[test]
fn two_walks_that_overlap_keep_the_resume_position_of_a_replaced_file() {
    let state = test_state();
    let root = kroma_testing::temp_dir("live-overlap");
    std::fs::write(root.path().join("Heat (1995).mkv"), b"x").unwrap();
    let defs = library(root.path());
    sync_walk(&WalkTurn::wait(), &state.db, &defs, &mut uninterrupted).unwrap();
    let heat = db::list_items(&state.db, None).unwrap().remove(0).id;
    let viewer = db::create_user(
        &state.db,
        "viewer@example.test",
        "viewer",
        "hash",
        &[Permission::Playback],
    )
    .unwrap();
    db::upsert_progress(&state.db, &viewer.id, &heat, 60_000, None).unwrap();
    let (finished, second_finished) = std::sync::mpsc::channel();
    let mut second = None;

    sync_walk_in(&WalkTurn::wait(), &state.db, &defs, ONE_FILE, &mut |_| {
        std::fs::rename(
            root.path().join("Heat (1995).mkv"),
            root.path().join("Heat (1995) - 1080p.mkv"),
        )
        .unwrap();
        let (db, defs, finished) = (state.db.clone(), defs.clone(), finished.clone());
        second = Some(std::thread::spawn(move || {
            sync_walk(&WalkTurn::wait(), &db, &defs, &mut uninterrupted).unwrap();
            let _ = finished.send(());
        }));
        assert!(
            second_finished.recv_timeout(OVERLAP_GRACE).is_err(),
            "the second walk ran while the first had not ended"
        );
        ControlFlow::Continue(())
    })
    .unwrap();
    second.unwrap().join().unwrap();

    let resume = db::get_progress(&state.db, &viewer.id, &heat).unwrap();
    assert_eq!(resume.map(|entry| entry.position_ms), Some(60_000));
    assert_eq!(file_rows(&state), 1);
}

#[test]
fn a_library_that_is_no_longer_configured_shows_no_title_while_the_others_are_walked() {
    let state = test_state();
    let kept = three_films("kept-library");
    let dropped = kroma_testing::temp_dir("live-dropped-library");
    std::fs::write(dropped.path().join("Ran (1985).mkv"), b"x").unwrap();
    let both = vec![
        library_named("lib-1", kept.path()),
        library_named("lib-gone", dropped.path()),
    ];
    sync_walk(&WalkTurn::wait(), &state.db, &both, &mut uninterrupted).unwrap();
    let mut shown_from_the_dropped_library = Vec::new();

    sync_walk_in(
        &WalkTurn::wait(),
        &state.db,
        &both[..1],
        ONE_FILE,
        &mut |_| {
            let shown = db::list_items(&state.db, Some("lib-gone")).unwrap().len();
            shown_from_the_dropped_library.push(shown);
            ControlFlow::Continue(())
        },
    )
    .unwrap();

    assert_eq!(shown_from_the_dropped_library, [0, 0, 0, 0]);
    assert_eq!(titles(&state), ["Alien", "Dune", "Heat"]);
}

#[test]
fn a_walk_stopped_before_its_first_batch_has_already_removed_what_is_no_longer_configured() {
    let state = test_state();
    let kept = three_films("kept-on-stop");
    let dropped = kroma_testing::temp_dir("live-dropped-on-stop");
    std::fs::write(dropped.path().join("Ran (1985).mkv"), b"x").unwrap();
    let both = vec![
        library_named("lib-1", kept.path()),
        library_named("lib-gone", dropped.path()),
    ];
    sync_walk(&WalkTurn::wait(), &state.db, &both, &mut uninterrupted).unwrap();
    let mut asked = 0;

    let walked = sync_walk_in(
        &WalkTurn::wait(),
        &state.db,
        &both[..1],
        ONE_FILE,
        &mut |_| {
            asked += 1;
            ControlFlow::Break(())
        },
    )
    .unwrap();

    assert!(matches!(walked, Walked::Stopped));
    assert_eq!(asked, 1);
    assert_eq!(titles(&state), ["Alien", "Dune", "Heat"]);
}

#[test]
fn a_show_whose_new_episode_a_stopped_walk_wrote_is_still_changed_for_the_next_walk_that_ends() {
    let state = test_state();
    let root = kroma_testing::temp_dir("live-stopped-episode");
    let show = root.path().join("Severance");
    std::fs::create_dir_all(&show).unwrap();
    std::fs::write(show.join("Severance S01E01.mkv"), b"x").unwrap();
    let defs = library(root.path());
    sync_walk(&WalkTurn::wait(), &state.db, &defs, &mut uninterrupted).unwrap();
    std::fs::write(show.join("Severance S01E02.mkv"), b"x").unwrap();

    let stopped = sync_walk_in(&WalkTurn::wait(), &state.db, &defs, ONE_FILE, &mut |rows| {
        if rows > 0 {
            ControlFlow::Break(())
        } else {
            ControlFlow::Continue(())
        }
    })
    .unwrap();
    let ended = synced(sync_walk(&WalkTurn::wait(), &state.db, &defs, &mut uninterrupted).unwrap());
    let after = synced(sync_walk(&WalkTurn::wait(), &state.db, &defs, &mut uninterrupted).unwrap());

    assert!(matches!(stopped, Walked::Stopped));
    assert_eq!(ended.changed_shows.len(), 1);
    assert!(after.changed_shows.is_empty());
}

#[test]
fn a_folder_named_by_two_libraries_gives_its_file_to_the_last_one_on_every_walk() {
    let state = test_state();
    let root = kroma_testing::temp_dir("live-shared-folder");
    std::fs::write(root.path().join("Heat (1995).mkv"), b"x").unwrap();
    let twice = vec![
        library_named("lib-a", root.path()),
        library_named("lib-b", root.path()),
    ];
    sync_walk(&WalkTurn::wait(), &state.db, &twice, &mut uninterrupted).unwrap();
    let mut rows_per_batch = Vec::new();

    sync_walk(&WalkTurn::wait(), &state.db, &twice, &mut |rows| {
        rows_per_batch.push(rows);
        ControlFlow::Continue(())
    })
    .unwrap();

    let items = db::list_items(&state.db, None).unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].library, "lib-b");
    assert_eq!(items[0].files.len(), 1);
    assert_eq!(file_rows(&state), 1);
    assert_eq!(rows_per_batch, [2, 1]);
}

#[test]
fn a_walk_that_waited_for_its_turn_walks_the_libraries_configured_when_it_comes() {
    let state = test_state();
    let first = three_films("turn-first");
    let added = kroma_testing::temp_dir("live-turn-added");
    std::fs::write(added.path().join("Ran (1985).mkv"), b"x").unwrap();
    let configured = vec![
        library_named("lib-1", first.path()),
        library_named("lib-added", added.path()),
    ];
    set_library_defs(&state.settings, &state.db, &configured[..1]);
    let (finished, waiter_finished) = std::sync::mpsc::channel();
    let mut waiter = None;

    sync_walk_in(
        &WalkTurn::wait(),
        &state.db,
        &configured[..1],
        ONE_FILE,
        &mut |_| {
            if waiter.is_none() {
                let (waiting, finished) = (state.clone(), finished.clone());
                waiter = Some(std::thread::spawn(move || {
                    rescan_sync(&WalkTurn::wait(), &waiting, &mut uninterrupted).unwrap();
                    let _ = finished.send(());
                }));
                assert!(waiter_finished.recv_timeout(OVERLAP_GRACE).is_err());
                set_library_defs(&state.settings, &state.db, &configured);
            }
            ControlFlow::Continue(())
        },
    )
    .unwrap();
    waiter.unwrap().join().unwrap();

    assert_eq!(titles(&state), ["Alien", "Dune", "Heat", "Ran"]);
}
