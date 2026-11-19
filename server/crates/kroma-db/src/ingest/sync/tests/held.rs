use kroma_domain::watching::{Resume, Watching};
use kroma_domain::Permission;

use super::super::*;
use crate::imports::{merge_states, Place};
use crate::ingest::test_support::*;

const HEAT: &str = "/media/Heat (1995).mkv";
const LAST_WEEK: i64 = 1_700_000_000;

fn ana(p: &Pool) -> String {
    let account = crate::create_user(p, "ana@example.test", "ana", "", &[Permission::Playback]);
    account.unwrap().id
}

fn held_while_no_scan_wrote_it(p: &Pool, account: &str) {
    let stopped = Watching {
        resume: Some(Resume {
            position_ms: 5_025_000,
            duration_ms: Some(10_200_000),
            at: LAST_WEEK,
        }),
        ..Default::default()
    };
    merge_states(p, account, &[(Place::File(HEAT), stopped)]).unwrap();
}

fn heat() -> MediaItem {
    movie("heat", "Heat", "lib", vec![file("f1", HEAT, false)])
}

#[test]
fn a_state_an_import_holds_shows_as_soon_as_a_batch_of_the_walk_writes_its_file() {
    let p = pool();
    let account = ana(&p);
    held_while_no_scan_wrote_it(&p, &account);
    let items = [heat()];
    let written: Vec<&MediaItem> = items.iter().collect();
    let mtimes = mtimes_of(&items, 100);

    sync_batch(
        &p,
        &ScanBatch {
            library: &lib("lib"),
            shows: &[],
            items: &written,
            mtimes: &mtimes,
        },
    )
    .unwrap();

    let resumed = crate::get_progress(&p, &account, "heat").unwrap();
    assert_eq!(resumed.map(|entry| entry.position_ms), Some(5_025_000));
}
