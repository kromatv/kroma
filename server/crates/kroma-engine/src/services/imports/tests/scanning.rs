use std::time::Duration;

use super::super::stages::Core;
use super::this_machine::{answered, at, films_at, review, this_machine};
use super::*;
use crate::services::jobs::JobKey;
use crate::services::scan::WalkTurn;

const SCAN: JobKey = JobKey("library.scan");

fn a_scan_that_runs(state: &SharedState) -> WalkTurn {
    let held = WalkTurn::wait();
    state.jobs.trigger(state.clone(), SCAN, "manual").unwrap();
    held
}

async fn scans_once_idle(state: &SharedState, wanted: usize) -> usize {
    for _ in 0..500 {
        let runs = db::list_job_runs(&state.db, SCAN.as_str(), 10).unwrap();
        let finished = runs.iter().filter(|run| run.finished_at.is_some()).count();
        if finished >= wanted && state.jobs.running_count() == 0 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    db::list_job_runs(&state.db, SCAN.as_str(), 10).unwrap().len()
}

#[tokio::test]
async fn an_import_that_adds_a_source_while_a_scan_runs_gets_one_more_scan_when_it_ends() {
    let disk = this_machine(&["films"]);
    let state = importing_from(&household());
    let running = a_scan_that_runs(&state);

    import(&state, &Core, &films_at(&at(&disk, "films")));
    drop(running);

    assert_eq!(scans_once_idle(&state, 2).await, 2);
}

#[tokio::test]
async fn imports_that_add_sources_during_one_scan_ask_for_one_more_scan_not_one_each() {
    let disk = this_machine(&["films", "shows"]);
    let state = importing_from(&household());
    let running = a_scan_that_runs(&state);

    import(&state, &Core, &films_at(&at(&disk, "films")));
    import(
        &state,
        &Core,
        &review(vec![answered("2", &[("/data/shows", &at(&disk, "shows"))])]),
    );
    drop(running);

    assert_eq!(scans_once_idle(&state, 2).await, 2);
}
