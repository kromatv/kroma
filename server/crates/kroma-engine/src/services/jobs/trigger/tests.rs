use super::*;
use crate::db;
use crate::model::Category;
use crate::services::jobs::test_support::{wait_idle, TEST_BUILTIN};
use crate::services::jobs::{JobContext, RemoteRun};
use crate::test_support;

#[test]
fn cancel_all_on_idle_manager_is_a_noop() {
    let m = JobManager::new();
    m.cancel_all();
    assert_eq!(m.running_count(), 0);
}

#[tokio::test]
async fn trigger_runs_a_job_to_success_and_records_the_run() {
    let state = test_support::test_state();
    let run: RemoteRun = Arc::new(|ctx: &JobContext| {
        ctx.info("did the work");
        Ok(())
    });
    state.jobs.register_remote("test.remote.ok", Category::Maintenance, None, run);

    let run_id =
        state.jobs.trigger(state.clone(), JobKey("test.remote.ok"), "manual").expect("triggered");
    wait_idle(&state.jobs).await;

    let runs = db::list_job_runs(&state.db, "test.remote.ok", 10).unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].id, run_id);
    assert_eq!(runs[0].status, "success");
    assert!(runs[0].finished_at.is_some());
    assert_eq!(state.jobs.running_count(), 0);
}

#[tokio::test]
async fn trigger_records_a_failed_run_with_its_message() {
    let state = test_support::test_state();
    let run: RemoteRun = Arc::new(|_ctx: &JobContext| Err(anyhow::anyhow!("kaput")));
    state.jobs.register_remote("test.remote.err", Category::Maintenance, None, run);

    state.jobs.trigger(state.clone(), JobKey("test.remote.err"), "manual").expect("triggered");
    wait_idle(&state.jobs).await;

    let runs = db::list_job_runs(&state.db, "test.remote.err", 10).unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].status, "failed");
    assert!(runs[0].error.as_deref().unwrap().contains("kaput"));
}

#[tokio::test]
async fn trigger_rejects_a_second_run_while_one_is_in_flight() {
    let state = test_support::test_state();
    // Blocks until released, so the first run is provably still in flight when
    // the second trigger is attempted.
    let gate = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let g = gate.clone();
    let run: RemoteRun = Arc::new(move |_ctx: &JobContext| {
        while !g.load(std::sync::atomic::Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        Ok(())
    });
    state.jobs.register_remote("test.remote.slow", Category::Maintenance, None, run);

    state.jobs.trigger(state.clone(), JobKey("test.remote.slow"), "manual").expect("first run");
    let second = state.jobs.trigger(state.clone(), JobKey("test.remote.slow"), "manual");
    assert_eq!(second, Err(TriggerError::AlreadyRunning));
    gate.store(true, std::sync::atomic::Ordering::Relaxed);
    wait_idle(&state.jobs).await;
}

fn until_cancelled() -> RemoteRun {
    Arc::new(|ctx: &JobContext| {
        while !ctx.cancelled() {
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        Ok(())
    })
}

#[tokio::test]
async fn cancelling_by_key_answers_whether_there_was_a_run_to_cancel() {
    let state = test_support::test_state();
    state.jobs.register_remote(
        "test.remote.cancel",
        Category::Maintenance,
        None,
        until_cancelled(),
    );
    state.jobs.trigger(state.clone(), JobKey("test.remote.cancel"), "manual").expect("triggered");

    assert!(state.jobs.cancel(JobKey("test.remote.cancel")), "the run was in flight");
    wait_idle(&state.jobs).await;
    assert!(!state.jobs.cancel(JobKey("test.remote.cancel")), "and is not, once it is over");

    let runs = db::list_job_runs(&state.db, "test.remote.cancel", 10).unwrap();
    assert_eq!(runs[0].status, "cancelled");
}

#[tokio::test]
async fn cancel_all_reaches_every_run_at_once() {
    let state = test_support::test_state();
    for key in ["test.remote.all.a", "test.remote.all.b"] {
        state.jobs.register_remote(key, Category::Maintenance, None, until_cancelled());
        state.jobs.trigger(state.clone(), JobKey(key), "manual").expect("triggered");
    }
    assert_eq!(state.jobs.running_count(), 2);

    state.jobs.cancel_all();
    wait_idle(&state.jobs).await;
    for key in ["test.remote.all.a", "test.remote.all.b"] {
        assert_eq!(db::list_job_runs(&state.db, key, 10).unwrap()[0].status, "cancelled");
    }
}

#[tokio::test]
async fn a_builtin_runs_through_the_same_path_as_a_module_job() {
    let state = test_support::test_state();
    let manager = Arc::new({
        let mut m = JobManager::new();
        m.register(&TEST_BUILTIN);
        m
    });

    let run_id = manager.trigger(state.clone(), JobKey("test.job"), "manual").expect("triggered");
    wait_idle(&manager).await;

    let runs = db::list_job_runs(&state.db, "test.job", 10).unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].id, run_id);
    assert_eq!(runs[0].status, "success");
}

#[tokio::test]
async fn a_run_whose_ledger_refuses_every_write_still_releases_its_slot() {
    let state = test_support::test_state();
    state.db.get().unwrap().execute("DROP TABLE job_runs", []).unwrap();
    let run: RemoteRun = Arc::new(|_ctx: &JobContext| Ok(()));
    state.jobs.register_remote("test.remote.noledger", Category::Maintenance, None, run);

    state
        .jobs
        .trigger(state.clone(), JobKey("test.remote.noledger"), "manual")
        .expect("triggered");
    wait_idle(&state.jobs).await;
    assert_eq!(state.jobs.running_count(), 0);
}

#[test]
fn trigger_unknown_job_is_rejected() {
    let state = test_support::test_state();
    assert_eq!(
        state.jobs.trigger(state.clone(), JobKey("does.not.exist"), "manual"),
        Err(TriggerError::Unknown)
    );
}
