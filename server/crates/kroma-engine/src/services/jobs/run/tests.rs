use std::sync::atomic::Ordering;

use super::*;
use crate::model::Category;
use crate::services::jobs::test_support::{test_pool, wait_idle, TEST_BUILTIN};
use crate::services::jobs::Builtin;
use crate::test_support;

#[test]
fn panic_message_downcasts_str_string_or_falls_back() {
    let s: Box<dyn std::any::Any + Send> = Box::new("boom");
    assert_eq!(panic_message(s.as_ref()), "panicked: boom");
    let owned: Box<dyn std::any::Any + Send> = Box::new(String::from("kaboom"));
    assert_eq!(panic_message(owned.as_ref()), "panicked: kaboom");
    let other: Box<dyn std::any::Any + Send> = Box::new(42u32);
    assert_eq!(panic_message(other.as_ref()), "panicked");
}

#[test]
fn classify_result_maps_every_outcome() {
    let handle = RunHandle::new("run-1".into(), "job".into());

    let ok: std::thread::Result<anyhow::Result<()>> = Ok(Ok(()));
    assert_eq!(classify_result(ok, &handle), ("success", None));

    let errd: std::thread::Result<anyhow::Result<()>> = Ok(Err(anyhow::anyhow!("nope")));
    let (status, msg) = classify_result(errd, &handle);
    assert_eq!(status, "failed");
    assert_eq!(msg.as_deref(), Some("nope"));

    let payload: Box<dyn std::any::Any + Send> = Box::new("splat");
    let panicked: std::thread::Result<anyhow::Result<()>> = Err(payload);
    assert_eq!(
        classify_result(panicked, &handle),
        ("failed", Some("panicked: splat".to_string()))
    );

    handle.request_cancel();
    let ok2: std::thread::Result<anyhow::Result<()>> = Ok(Ok(()));
    assert_eq!(classify_result(ok2, &handle), ("cancelled", None));
}

fn start(id: &str) -> db::RunStart<'_> {
    db::RunStart {
        id,
        key: "test.job",
        trigger: "manual",
        started_ms: 1_000,
    }
}

#[test]
fn a_finish_lands_even_when_the_start_was_never_recorded() {
    let pool = test_pool();

    assert!(finalize_run(&pool, &start("run-lost"), "success", 2_000, None));

    let runs = db::list_job_runs(&pool, "test.job", 10).unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].status, "success");
    assert_eq!(runs[0].trigger, "manual");
    assert_eq!(runs[0].started_at, 1_000);
}

#[test]
fn a_failure_after_a_failure_is_already_failing() {
    let pool = test_pool();
    db::insert_job_run(&pool, "run-1", "test.job", "manual", 1_000).unwrap();
    assert!(finalize_run(&pool, &start("run-1"), "failed", 1_500, Some("boom")));
    db::insert_job_run(&pool, "run-2", "test.job", "manual", 2_000).unwrap();

    assert!(already_failing(&pool, "test.job", "run-2"));
}

#[test]
fn a_failure_after_a_success_is_news() {
    let pool = test_pool();
    db::insert_job_run(&pool, "run-1", "test.job", "manual", 1_000).unwrap();
    assert!(finalize_run(&pool, &start("run-1"), "success", 1_500, None));
    db::insert_job_run(&pool, "run-2", "test.job", "manual", 2_000).unwrap();

    assert!(!already_failing(&pool, "test.job", "run-2"));
}

#[test]
fn a_run_a_restart_cut_short_does_not_make_the_next_failure_a_repeat() {
    let pool = test_pool();
    db::insert_job_run(&pool, "run-0", "test.job", "manual", 500).unwrap();
    assert!(finalize_run(&pool, &start("run-0"), "success", 600, None));
    db::insert_job_run(&pool, "run-1", "test.job", "manual", 1_000).unwrap();
    db::reconcile_running_runs(&pool).unwrap();
    db::insert_job_run(&pool, "run-2", "test.job", "manual", 2_000).unwrap();

    assert!(!already_failing(&pool, "test.job", "run-2"));
}

#[test]
fn finalize_run_records_terminal_status() {
    let pool = test_pool();
    db::insert_job_run(&pool, "run-x", "test.job", "manual", 1_000).unwrap();
    assert!(finalize_run(&pool, &start("run-x"), "success", 2_000, None));
    let runs = db::list_job_runs(&pool, "test.job", 10).unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].status, "success");
    assert_eq!(runs[0].finished_at, Some(2_000));
}

#[test]
fn finalize_run_records_failure_message() {
    let pool = test_pool();
    db::insert_job_run(&pool, "run-y", "test.job", "manual", 1_000).unwrap();
    assert!(finalize_run(&pool, &start("run-y"), "failed", 3_000, Some("boom")));
    let runs = db::list_job_runs(&pool, "test.job", 10).unwrap();
    assert_eq!(runs[0].status, "failed");
    assert_eq!(runs[0].error.as_deref(), Some("boom"));
}

static CHAIN_GATE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn wait_for_the_gate(_ctx: &JobContext) -> anyhow::Result<()> {
    while !CHAIN_GATE.load(Ordering::Relaxed) {
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    Ok(())
}

static CHAINED_BUILTIN: Builtin = Builtin {
    key: JobKey("test.chained"),
    category: Category::Maintenance,
    schedule: None,
    triggers: &[Trigger::AfterJob(JobKey("test.job"))],
    run: wait_for_the_gate,
};

#[tokio::test]
async fn a_dependent_still_running_from_the_last_pass_is_not_started_twice() {
    let state = test_support::test_state();
    let manager = Arc::new({
        let mut m = JobManager::new();
        m.register(&TEST_BUILTIN);
        m.register(&CHAINED_BUILTIN);
        m
    });
    CHAIN_GATE.store(false, Ordering::Relaxed);
    manager
        .trigger(state.clone(), JobKey("test.chained"), "manual")
        .expect("triggered");

    chain_after(&manager, &state, JobKey("test.job"), "test.job", "success");

    assert_eq!(
        manager.running_count(),
        1,
        "the chain must not queue a second run"
    );
    CHAIN_GATE.store(true, Ordering::Relaxed);
    wait_idle(&manager).await;
    assert_eq!(
        db::list_job_runs(&state.db, "test.chained", 10)
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn chain_after_does_not_fire_dependents_on_non_success() {
    let state = test_support::test_state();
    chain_after(
        &state.jobs,
        &state,
        JobKey("test.remote.ok"),
        "test.remote.ok",
        "failed",
    );
    chain_after(
        &state.jobs,
        &state,
        JobKey("test.remote.ok"),
        "test.remote.ok",
        "cancelled",
    );
    assert_eq!(state.jobs.running_count(), 0);
}
