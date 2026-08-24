use super::test_support::{log_lines, process_ok, test_pool, test_stage};
use super::*;
use crate::state::SharedState;
use crate::test_support;
use crate::test_support::test_state;

#[test]
fn pending_count_sums_pending_and_running() {
    let pool = test_pool();
    // An empty ledger for a stage counts zero.
    assert_eq!(pending_count(&pool, "probe").unwrap(), 0);
    // Freshly-enqueued tasks are pending, so they are counted.
    db::pipeline::enqueue(&pool, "probe", "file", "f1", 100, now_ms()).unwrap();
    db::pipeline::enqueue(&pool, "probe", "file", "f2", 100, now_ms()).unwrap();
    assert_eq!(pending_count(&pool, "probe").unwrap(), 2);
    // A different stage's queue is independent.
    assert_eq!(pending_count(&pool, "metadata").unwrap(), 0);
}

#[test]
fn a_stage_with_nothing_in_scope_clears_its_ledger_instead_of_draining() {
    let state = test_state();
    test_support::seed_task(&state, "teststage", "file", "vanished", "pending", None);
    run(
        &test_stage(process_ok),
        &JobContext::for_test(state.clone()),
    )
    .unwrap();

    let left: i64 = state
        .db
        .get()
        .unwrap()
        .query_row(
            "SELECT COUNT(*) FROM pipeline_tasks WHERE stage='teststage'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(left, 0);
}

#[test]
fn a_drain_parks_on_the_admin_hold_and_picks_up_where_it_left_off() {
    let state = test_state();
    let ctx = JobContext::for_test(state.clone());
    let mut rx = state.events.subscribe();
    state.jobs.set_pipeline_paused(true);

    let resume = state.clone();
    std::thread::spawn(move || {
        thread::sleep(Duration::from_millis(200));
        resume.jobs.set_pipeline_paused(false);
    });

    drain_loop(&test_stage(process_ok), &ctx, 1).unwrap();
    assert_eq!(
        log_lines(&mut rx),
        vec![
            "teststage: paused (pipeline held by admin)".to_string(),
            "teststage: resumed".to_string(),
        ]
    );
}

#[test]
fn a_drain_cancelled_while_parked_stops_rather_than_waiting_for_the_hold() {
    use crate::services::jobs::RunHandle;
    let state = test_state();
    let handle = std::sync::Arc::new(RunHandle::new("r".into(), "k".into()));
    let ctx = JobContext::from_handle(state.clone(), handle.clone());
    let mut rx = state.events.subscribe();
    state.jobs.set_pipeline_paused(true);

    let cancel_after = std::sync::Arc::clone(&handle);
    std::thread::spawn(move || {
        thread::sleep(Duration::from_millis(200));
        cancel_after.request_cancel();
    });

    drain_loop(&test_stage(process_ok), &ctx, 1).unwrap();
    assert_eq!(
        log_lines(&mut rx),
        vec![
            "teststage: paused (pipeline held by admin)".to_string(),
            "teststage: cancelled while paused".to_string(),
        ]
    );
}

// Subjects the synthetic stage reports, and the ids it was asked to
// process. Statics because `Stage` holds plain `fn` pointers, not closures.
static SUBJECTS: std::sync::Mutex<Vec<(String, String)>> = std::sync::Mutex::new(Vec::new());
static PROCESSED: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());
static FAIL_ON: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);
// One drain at a time: the statics above are shared state.
static SERIAL: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn enumerate_static(_state: &SharedState) -> Result<Vec<(String, String)>> {
    Ok(SUBJECTS.lock().unwrap().clone())
}

fn process_static(_ctx: &JobContext, id: &str) -> Result<()> {
    PROCESSED.lock().unwrap().push(id.to_string());
    if FAIL_ON.lock().unwrap().as_deref() == Some(id) {
        anyhow::bail!("this one always fails");
    }
    Ok(())
}

const TEST_STAGE: Stage = Stage {
    short: "testing",
    key: "pipeline.testing",
    subject_kind: "item",
    concurrency: 1,
    pause_for_playback: false,
    enumerate: enumerate_static,
    process: process_static,
};

// Set the subject set, drain once, and return the ids that were processed.
fn drain(state: &SharedState, subjects: &[(&str, &str)]) -> Vec<String> {
    *SUBJECTS.lock().unwrap() = subjects
        .iter()
        .map(|(id, sig)| (id.to_string(), sig.to_string()))
        .collect();
    PROCESSED.lock().unwrap().clear();
    run(&TEST_STAGE, &JobContext::for_test(state.clone())).unwrap();
    let mut done = PROCESSED.lock().unwrap().clone();
    done.sort();
    done
}

fn status_of(state: &SharedState, id: &str) -> Option<String> {
    state
        .db
        .get()
        .unwrap()
        .query_row(
            "SELECT status FROM pipeline_tasks WHERE stage='testing' AND subject_id=?1",
            [id],
            |r| r.get(0),
        )
        .ok()
}

#[test]
fn a_drain_processes_every_subject_once_and_then_stops() {
    let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
    let state = test_state();
    *FAIL_ON.lock().unwrap() = None;

    assert_eq!(drain(&state, &[("a", "v1"), ("b", "v1")]), ["a", "b"]);
    // A second drain with the same signatures has nothing to do - that is
    // what makes the pipeline cheap to re-run on a schedule.
    assert!(drain(&state, &[("a", "v1"), ("b", "v1")]).is_empty());
    // A changed signature re-queues only that subject.
    assert_eq!(drain(&state, &[("a", "v2"), ("b", "v1")]), ["a"]);
}

#[test]
fn a_task_left_running_by_a_dead_drain_is_reclaimed() {
    // One-run-per-key means a `running` row here was stranded by a drain that
    // died mid-batch; `reconcile` never touches those, so without this reclaim
    // the subject would silently never reprocess.
    let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
    let state = test_state();
    *FAIL_ON.lock().unwrap() = None;

    crate::test_support::seed_task(&state, "testing", "item", "stranded", "running", None);
    assert_eq!(status_of(&state, "stranded").as_deref(), Some("running"));

    assert_eq!(drain(&state, &[("stranded", "v1")]), ["stranded"]);
    assert_eq!(status_of(&state, "stranded").as_deref(), Some("done"));
}

#[test]
fn a_subject_that_left_the_set_is_dropped_from_the_ledger() {
    // Otherwise a deleted title's task sits pending forever and every drain
    // re-attempts a subject that no longer exists.
    let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
    let state = test_state();
    *FAIL_ON.lock().unwrap() = None;

    drain(&state, &[("a", "v1"), ("gone", "v1")]);
    assert!(status_of(&state, "gone").is_some());

    drain(&state, &[("a", "v1")]);
    assert_eq!(
        status_of(&state, "gone"),
        None,
        "the vanished subject was left behind"
    );
}

#[test]
fn a_failing_subject_is_recorded_and_does_not_stop_the_others() {
    // One bad file must not abandon the rest of the batch, and the failure
    // has to be visible in the ledger rather than just retried forever.
    let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
    let state = test_state();
    *FAIL_ON.lock().unwrap() = Some("bad".to_string());

    let done = drain(&state, &[("good", "v1"), ("bad", "v1")]);
    assert_eq!(done, ["bad", "good"], "both were attempted");
    assert_eq!(status_of(&state, "good").as_deref(), Some("done"));
    assert_ne!(status_of(&state, "bad").as_deref(), Some("done"));
    *FAIL_ON.lock().unwrap() = None;
}

#[test]
fn a_cancelled_drain_stops_claiming() {
    let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
    let state = test_state();
    *FAIL_ON.lock().unwrap() = None;
    *SUBJECTS.lock().unwrap() = (0..5)
        .map(|n| (format!("s{n}"), "v1".to_string()))
        .collect();
    PROCESSED.lock().unwrap().clear();

    let handle = std::sync::Arc::new(crate::services::jobs::RunHandle::new(
        "t".into(),
        "pipeline.testing".into(),
    ));
    handle.request_cancel();
    run(&TEST_STAGE, &JobContext::from_handle(state, handle)).unwrap();

    assert!(
        PROCESSED.lock().unwrap().is_empty(),
        "cancelled before the first claim"
    );
}

#[test]
fn a_ledger_that_is_gone_is_reported_rather_than_drained_blind() {
    let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
    let state = test_support::test_state();
    *SUBJECTS.lock().unwrap() = vec![("m1".to_string(), "sig".to_string())];
    state
        .db
        .get()
        .unwrap()
        .execute_batch("DROP TABLE pipeline_tasks")
        .unwrap();

    assert!(run(&TEST_STAGE, &JobContext::for_test(state)).is_err());
}

#[test]
fn a_batch_whose_result_cannot_be_recorded_still_releases_what_it_claimed() {
    let _serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
    let state = test_support::test_state();
    *SUBJECTS.lock().unwrap() = vec![("m1".to_string(), "sig".to_string())];
    PROCESSED.lock().unwrap().clear();
    state
        .db
        .get()
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER no_release BEFORE UPDATE ON pipeline_tasks \
             WHEN OLD.status = 'running' BEGIN SELECT RAISE(ABORT, 'refused'); END",
        )
        .unwrap();

    assert!(run(&TEST_STAGE, &JobContext::for_test(state)).is_err());
    assert_eq!(
        PROCESSED.lock().unwrap().as_slice(),
        ["m1"],
        "the work itself was attempted"
    );
}
