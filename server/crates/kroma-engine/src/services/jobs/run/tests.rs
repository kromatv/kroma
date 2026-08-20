use std::sync::atomic::Ordering;

use super::*;
use crate::services::jobs::test_support::{test_pool, wait_idle, TEST_BUILTIN};
use crate::services::jobs::Builtin;
use crate::model::Category;
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
    assert_eq!(classify_result(panicked, &handle), ("failed", Some("panicked: splat".to_string())));

    handle.request_cancel();
    let ok2: std::thread::Result<anyhow::Result<()>> = Ok(Ok(()));
    assert_eq!(classify_result(ok2, &handle), ("cancelled", None));
}

#[test]
fn finalize_run_records_terminal_status() {
    let pool = test_pool();
    db::insert_job_run(&pool, "run-x", "test.job", "manual", 1_000).unwrap();
    assert!(finalize_run(&pool, "run-x", "test.job", "success", 2_000, None));
    let runs = db::list_job_runs(&pool, "test.job", 10).unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].status, "success");
    assert_eq!(runs[0].finished_at, Some(2_000));
}

#[test]
fn finalize_run_records_failure_message() {
    let pool = test_pool();
    db::insert_job_run(&pool, "run-y", "test.job", "manual", 1_000).unwrap();
    assert!(finalize_run(&pool, "run-y", "test.job", "failed", 3_000, Some("boom")));
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
    manager.trigger(state.clone(), JobKey("test.chained"), "manual").expect("triggered");

    chain_after(&manager, &state, JobKey("test.job"), "test.job", "success");

    assert_eq!(manager.running_count(), 1, "the chain must not queue a second run");
    CHAIN_GATE.store(true, Ordering::Relaxed);
    wait_idle(&manager).await;
    assert_eq!(db::list_job_runs(&state.db, "test.chained", 10).unwrap().len(), 1);
}

#[test]
fn chain_after_does_not_fire_dependents_on_non_success() {
    let state = test_support::test_state();
    chain_after(&state.jobs, &state, JobKey("test.remote.ok"), "test.remote.ok", "failed");
    chain_after(&state.jobs, &state, JobKey("test.remote.ok"), "test.remote.ok", "cancelled");
    assert_eq!(state.jobs.running_count(), 0);
}
