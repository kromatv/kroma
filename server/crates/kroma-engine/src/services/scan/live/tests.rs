use std::ops::ControlFlow;
use std::path::Path;
use std::time::{Duration, Instant};

use super::*;
use crate::state::SharedState;
use crate::test_support::test_state;

mod between_walks;

const ONE_FILE: BatchSize = BatchSize {
    files: 1,
    every: Duration::from_secs(3600),
};

fn library(root: &Path) -> Vec<LibraryDef> {
    vec![LibraryDef {
        id: "lib-1".into(),
        name: "Library".into(),
        kind: String::new(),
        folders: vec![root.to_string_lossy().into_owned()],
        auto_scan: true,
    }]
}

fn three_films(tag: &str) -> kroma_testing::TempDir {
    let root = kroma_testing::temp_dir(&format!("live-{tag}"));
    for film in ["Alien (1979)", "Dune (2021)", "Heat (1995)"] {
        std::fs::write(root.path().join(format!("{film}.mkv")), b"x").unwrap();
    }
    root
}

fn titles(state: &SharedState) -> Vec<String> {
    let mut titles: Vec<String> = db::list_items(&state.db, None)
        .unwrap()
        .into_iter()
        .map(|item| item.title)
        .collect();
    titles.sort();
    titles
}

fn stop_after_the_first_batch(_rows: usize) -> ControlFlow<()> {
    ControlFlow::Break(())
}

#[test]
fn the_first_batch_is_browsable_before_the_second_is_walked() {
    let state = test_state();
    let root = three_films("first-batch");
    let mut browsable = Vec::new();

    let walked = sync_walk_in(
        &WalkTurn::wait(),
        &state.db,
        &library(root.path()),
        ONE_FILE,
        &mut |_| {
            browsable.push(titles(&state).len());
            ControlFlow::Continue(())
        },
    )
    .unwrap();

    assert!(matches!(walked, Walked::Synced(_)));
    assert_eq!(browsable, [1, 2, 3]);
}

#[test]
fn a_walk_closes_a_batch_on_time_alone_when_the_files_are_few() {
    let state = test_state();
    let root = three_films("on-time");
    let on_time = BatchSize {
        files: usize::MAX,
        every: Duration::ZERO,
    };
    let mut browsable = Vec::new();

    sync_walk_in(
        &WalkTurn::wait(),
        &state.db,
        &library(root.path()),
        on_time,
        &mut |_| {
            browsable.push(titles(&state).len());
            ControlFlow::Continue(())
        },
    )
    .unwrap();

    assert_eq!(browsable, [1, 2, 3]);
}

#[test]
fn a_walk_that_stops_early_removes_nothing() {
    let state = test_state();
    let root = three_films("partial");
    let defs = library(root.path());
    sync_walk(&WalkTurn::wait(), &state.db, &defs, &mut uninterrupted).unwrap();
    std::fs::remove_file(root.path().join("Alien (1979).mkv")).unwrap();
    std::fs::remove_file(root.path().join("Dune (2021).mkv")).unwrap();
    std::fs::write(root.path().join("Ran (1985).mkv"), b"x").unwrap();

    let walked = sync_walk_in(
        &WalkTurn::wait(),
        &state.db,
        &defs,
        ONE_FILE,
        &mut stop_after_the_first_batch,
    )
    .unwrap();

    assert!(matches!(walked, Walked::Stopped));
    let kept = titles(&state);
    assert!(kept.len() >= 3, "{kept:?}");
    assert!(kept.contains(&"Alien".to_string()), "{kept:?}");
    assert!(kept.contains(&"Dune".to_string()), "{kept:?}");
}

#[test]
fn a_walk_that_reads_every_folder_removes_what_is_gone() {
    let state = test_state();
    let root = three_films("full");
    let defs = library(root.path());
    sync_walk(&WalkTurn::wait(), &state.db, &defs, &mut uninterrupted).unwrap();
    std::fs::remove_file(root.path().join("Alien (1979).mkv")).unwrap();

    let walked = sync_walk_in(
        &WalkTurn::wait(),
        &state.db,
        &defs,
        ONE_FILE,
        &mut uninterrupted,
    )
    .unwrap();

    assert!(matches!(walked, Walked::Synced(_)));
    assert_eq!(titles(&state), ["Dune", "Heat"]);
}

#[test]
fn a_rescan_of_an_unchanged_library_writes_no_row_in_any_batch() {
    let state = test_state();
    let root = three_films("unchanged");
    let defs = library(root.path());
    sync_walk(&WalkTurn::wait(), &state.db, &defs, &mut uninterrupted).unwrap();
    let mut rows_per_batch = Vec::new();

    sync_walk_in(&WalkTurn::wait(), &state.db, &defs, ONE_FILE, &mut |rows| {
        rows_per_batch.push(rows);
        ControlFlow::Continue(())
    })
    .unwrap();

    assert_eq!(rows_per_batch, [0, 0, 0]);
}

#[test]
fn a_walk_cancelled_between_batches_leaves_whole_titles_and_no_orphan() {
    let state = test_state();
    let root = kroma_testing::temp_dir("live-cancelled");
    let show = root.path().join("Severance");
    std::fs::create_dir_all(&show).unwrap();
    std::fs::write(show.join("Severance S01E01.mkv"), b"x").unwrap();
    std::fs::write(show.join("Severance S01E02.mkv"), b"x").unwrap();
    let batches = std::cell::Cell::new(0);

    let walked = sync_walk_in(
        &WalkTurn::wait(),
        &state.db,
        &library(root.path()),
        ONE_FILE,
        &mut |_| {
            batches.set(batches.get() + 1);
            ControlFlow::Break(())
        },
    )
    .unwrap();

    assert!(matches!(walked, Walked::Stopped));
    assert_eq!(batches.get(), 1);
    let items = db::list_items(&state.db, None).unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].files.len(), 1);
    let shows = db::list_shows(&state.db, None).unwrap();
    assert_eq!(shows.len(), 1);
    assert_eq!(items[0].show_id.as_deref(), Some(shows[0].id.as_str()));
}

#[test]
fn a_walk_that_finds_no_title_writes_nothing_and_says_so() {
    let state = test_state();
    let root = three_films("emptied");
    let defs = library(root.path());
    sync_walk(&WalkTurn::wait(), &state.db, &defs, &mut uninterrupted).unwrap();
    for film in ["Alien (1979)", "Dune (2021)", "Heat (1995)"] {
        std::fs::remove_file(root.path().join(format!("{film}.mkv"))).unwrap();
    }

    let walked = sync_walk(&WalkTurn::wait(), &state.db, &defs, &mut uninterrupted).unwrap();

    assert!(matches!(
        walked,
        Walked::Empty {
            unreadable: 0,
            dropped: 0
        }
    ));
    assert_eq!(titles(&state).len(), 3);
}

#[test]
fn a_batch_the_database_refuses_fails_the_walk() {
    let state = test_state();
    let root = three_films("refused");
    state
        .db
        .get()
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER no_file_insert BEFORE INSERT ON files \
             BEGIN SELECT RAISE(ABORT, 'refused'); END",
        )
        .unwrap();

    let walked = sync_walk(
        &WalkTurn::wait(),
        &state.db,
        &library(root.path()),
        &mut uninterrupted,
    );

    assert!(walked.is_err());
    assert!(titles(&state).is_empty());
}

#[test]
fn a_walk_that_adds_an_episode_reports_its_show_as_changed() {
    let state = test_state();
    let root = kroma_testing::temp_dir("live-changed-show");
    let show = root.path().join("Severance");
    std::fs::create_dir_all(&show).unwrap();
    std::fs::write(show.join("Severance S01E01.mkv"), b"x").unwrap();
    let defs = library(root.path());
    sync_walk(&WalkTurn::wait(), &state.db, &defs, &mut uninterrupted).unwrap();
    std::fs::write(show.join("Severance S01E02.mkv"), b"x").unwrap();

    let Walked::Synced(again) = sync_walk_in(
        &WalkTurn::wait(),
        &state.db,
        &defs,
        ONE_FILE,
        &mut uninterrupted,
    )
    .unwrap() else {
        panic!("expected the walk to read every folder");
    };
    let Walked::Synced(unchanged) =
        sync_walk(&WalkTurn::wait(), &state.db, &defs, &mut uninterrupted).unwrap()
    else {
        panic!("expected the walk to read every folder");
    };

    assert_eq!(again.changed_shows.len(), 1);
    assert!(unchanged.changed_shows.is_empty());
}

fn library_updates(
    events: &mut tokio::sync::broadcast::Receiver<crate::infra::events::Envelope>,
) -> usize {
    let mut updates = 0;
    while let Ok(envelope) = events.try_recv() {
        assert!(envelope.payload_unrouted().contains("library.updated"));
        updates += 1;
    }
    updates
}

#[test]
fn a_batch_that_wrote_nothing_is_not_announced() {
    let bus = Bus::new();
    let mut events = bus.subscribe();
    let mut announcer = BatchAnnouncer::new(&bus);

    announcer.wrote(0);

    assert_eq!(library_updates(&mut events), 0);
}

#[test]
fn batches_written_in_quick_succession_are_announced_once() {
    let bus = Bus::new();
    let mut events = bus.subscribe();
    let mut announcer = BatchAnnouncer::new(&bus);

    announcer.wrote(3);
    announcer.wrote(2);

    assert_eq!(library_updates(&mut events), 1);
}

#[test]
fn a_batch_held_back_is_announced_with_the_next_one_that_is_due() {
    let bus = Bus::new();
    let mut events = bus.subscribe();
    let mut announcer = BatchAnnouncer::new(&bus);
    let start = Instant::now();

    announcer.wrote_at(3, start);
    announcer.wrote_at(2, start + Duration::from_secs(1));
    let held_back = library_updates(&mut events);
    announcer.wrote_at(0, start + Duration::from_secs(3));

    assert_eq!(held_back, 1);
    assert_eq!(library_updates(&mut events), 1);
}
