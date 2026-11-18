use super::super::*;
use super::tmp_root;
use crate::services::settings::{set_library_defs, LibraryDef};
use crate::test_support::test_state;

fn configured_library(dir: &std::path::Path) -> LibraryDef {
    LibraryDef {
        id: "lib-1".into(),
        name: "Films".into(),
        kind: "movies".into(),
        folders: vec![dir.to_string_lossy().into_owned()],
        auto_scan: true,
    }
}

fn item_count(state: &crate::state::SharedState) -> i64 {
    state
        .db
        .get()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0))
        .unwrap()
}

fn applied(scanned: Scanned) -> ScanData {
    match scanned {
        Scanned::Applied(data) => data,
        Scanned::MountOffline | Scanned::Cancelled => panic!("expected the scan to be applied"),
    }
}

#[test]
fn a_server_with_nothing_configured_gets_the_demo_catalogue() {
    // True demo mode: no libraries at all. Showing an empty app on first run
    // makes it look broken, so the demo content stands in.
    let state = test_state();
    let data = applied(rescan_sync(&WalkTurn::wait(), &state, &mut uninterrupted).unwrap());
    assert!(
        !data.items.is_empty(),
        "demo content should have been seeded"
    );
    assert!(item_count(&state) > 0);
}

#[test]
fn a_configured_library_that_reads_empty_is_never_replaced_with_demo_content() {
    // The case this guard exists for: an NAS/SMB share that is unmounted, or
    // slow to mount, or briefly unreadable, scans as ZERO items. Seeding on
    // an empty RESULT rather than an empty CONFIG would replace the user's
    // real library with demo movies - and the next scan would have nothing
    // to restore it from.
    let state = test_state();
    let empty = tmp_root("unmounted");
    set_library_defs(
        &state.settings,
        &state.db,
        &[configured_library(empty.path())],
    );

    assert!(matches!(
        rescan_sync(&WalkTurn::wait(), &state, &mut uninterrupted).unwrap(),
        Scanned::MountOffline
    ));
    assert_eq!(
        item_count(&state),
        0,
        "demo content was seeded over a real library"
    );
}

// The one that matters: the guard above only proved demo content was not
// seeded, because the database was empty either way. This starts from a
// library that is really there, then takes the mount away.
#[test]
fn an_unmounted_share_never_deletes_the_library_it_already_scanned() {
    let state = test_state();
    let root = tmp_root("mount-goes-away");
    let movie = root.path().join("Blade Runner (1982).mkv");
    std::fs::write(&movie, b"x").unwrap();
    set_library_defs(
        &state.settings,
        &state.db,
        &[configured_library(root.path())],
    );

    let scanned = applied(rescan_sync(&WalkTurn::wait(), &state, &mut uninterrupted).unwrap());
    assert_eq!(scanned.items.len(), 1);
    assert_eq!(item_count(&state), 1, "the real library is indexed");

    // The share drops: the folder is still configured, and reads as empty.
    std::fs::remove_file(&movie).unwrap();

    assert!(matches!(
        rescan_sync(&WalkTurn::wait(), &state, &mut uninterrupted).unwrap(),
        Scanned::MountOffline
    ));
    assert_eq!(
        item_count(&state),
        1,
        "the stored index survived the outage"
    );
}

#[test]
fn a_library_pointed_at_a_folder_that_is_not_there_is_also_left_alone() {
    // Same failure, harsher: the mount point does not exist at all.
    let state = test_state();
    let gone = tmp_root("mount-point");
    let missing = gone.path().join("no-such-mount-point-ever");
    set_library_defs(&state.settings, &state.db, &[configured_library(&missing)]);

    assert!(matches!(
        rescan_sync(&WalkTurn::wait(), &state, &mut uninterrupted).unwrap(),
        Scanned::MountOffline
    ));
    assert_eq!(item_count(&state), 0);
}

#[test]
fn a_scan_announces_its_start_and_its_counts() {
    // The UI shows a progress state off these, so a scan that never
    // announces completion leaves a spinner running forever.
    let state = test_state();
    let data = applied(scan_and_publish(&state, &|| false).unwrap());
    assert!(
        !data.items.is_empty(),
        "demo mode, so there is something to report"
    );

    let activity = crate::services::activity::snapshot(&state.activity);
    let rendered = serde_json::to_string(&activity).unwrap_or_default();
    assert!(
        rendered.contains("scan"),
        "the activity feed says nothing about the scan"
    );
}

fn announced(
    events: &mut tokio::sync::broadcast::Receiver<crate::infra::events::Envelope>,
) -> Vec<String> {
    let mut types = Vec::new();
    while let Ok(envelope) = events.try_recv() {
        let event: serde_json::Value = serde_json::from_str(envelope.payload_unrouted()).unwrap();
        types.push(event["type"].as_str().unwrap().to_string());
    }
    types
}

fn library_with_one_film(state: &crate::state::SharedState, tag: &str) -> kroma_testing::TempDir {
    let root = tmp_root(tag);
    std::fs::write(root.path().join("Blade Runner (1982).mkv"), b"x").unwrap();
    set_library_defs(
        &state.settings,
        &state.db,
        &[configured_library(root.path())],
    );
    root
}

#[test]
fn a_scan_announces_the_titles_it_wrote_before_it_completes() {
    let state = test_state();
    let _root = library_with_one_film(&state, "announce-first");
    let mut events = state.events.subscribe();

    applied(scan_and_publish(&state, &|| false).unwrap());

    assert_eq!(
        announced(&mut events),
        [
            "scan.started",
            "library.updated",
            "scan.completed",
            "library.updated"
        ]
    );
}

#[test]
fn a_rescan_of_an_unchanged_library_announces_only_its_end() {
    let state = test_state();
    let _root = library_with_one_film(&state, "announce-unchanged");
    applied(scan_and_publish(&state, &|| false).unwrap());
    let mut events = state.events.subscribe();

    applied(scan_and_publish(&state, &|| false).unwrap());

    assert_eq!(
        announced(&mut events),
        ["scan.started", "scan.completed", "library.updated"]
    );
}

#[test]
fn a_scan_cancelled_after_a_batch_keeps_the_batch_and_reports_what_is_stored() {
    let state = test_state();
    let _root = library_with_one_film(&state, "announce-cancelled");
    let mut events = state.events.subscribe();

    let scanned = scan_and_publish(&state, &|| true).unwrap();

    assert!(matches!(scanned, Scanned::Cancelled));
    assert_eq!(item_count(&state), 1);
    assert_eq!(
        announced(&mut events),
        ["scan.started", "library.updated", "scan.completed"]
    );
    let activity = crate::services::activity::snapshot(&state.activity);
    assert_eq!((activity.scanning, activity.items), (false, 1));
}

#[test]
fn a_scan_whose_later_batch_fails_announces_the_batches_it_wrote_and_its_end() {
    let state = test_state();
    let roots = ["Alien (1979)", "Dune (2021)", "Heat (1995)"].map(|film| {
        let root = tmp_root("announce-failed");
        std::fs::write(root.path().join(format!("{film}.mkv")), b"x").unwrap();
        root
    });
    let libraries: Vec<LibraryDef> = roots
        .iter()
        .enumerate()
        .map(|(n, root)| LibraryDef {
            id: format!("lib-{n}"),
            ..configured_library(root.path())
        })
        .collect();
    set_library_defs(&state.settings, &state.db, &libraries);
    state
        .db
        .get()
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER refuse_heat BEFORE INSERT ON items WHEN NEW.title = 'Heat' \
             BEGIN SELECT RAISE(ABORT, 'refused'); END",
        )
        .unwrap();
    let mut events = state.events.subscribe();

    let failed = scan_and_publish(&state, &|| false);

    assert!(failed.is_err());
    assert_eq!(
        announced(&mut events),
        [
            "scan.started",
            "library.updated",
            "library.updated",
            "scan.completed"
        ]
    );
    let activity = crate::services::activity::snapshot(&state.activity);
    assert_eq!((activity.scanning, activity.items), (false, 2));
}
