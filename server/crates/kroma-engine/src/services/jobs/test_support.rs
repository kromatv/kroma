use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use crate::db::testing::TempPool;
use crate::model::Category;

use super::{Builtin, JobContext, JobKey, JobManager, RemoteRun, Trigger};

const POLL: Duration = Duration::from_millis(5);

pub(super) fn test_pool() -> TempPool {
    crate::db::testing::temp_pool("jobs-test")
}

pub(super) fn noop_run(_ctx: &JobContext) -> anyhow::Result<()> {
    Ok(())
}

pub(super) static TEST_BUILTIN: Builtin = Builtin {
    key: JobKey("test.job"),
    category: Category::Maintenance,
    schedule: Some("0 4 * * *"),
    triggers: &[Trigger::LibraryChange],
    run: noop_run,
};

pub(super) fn until_cancelled() -> RemoteRun {
    Arc::new(|ctx: &JobContext| {
        poll_until(|| ctx.cancelled());
        Ok(())
    })
}

pub(super) fn publishing_progress(done: usize, total: usize) -> RemoteRun {
    Arc::new(move |ctx: &JobContext| {
        ctx.progress(done, total);
        poll_until(|| ctx.cancelled());
        Ok(())
    })
}

#[derive(Default)]
pub(super) struct Gate(AtomicBool);

impl Gate {
    pub(super) fn release(&self) {
        self.0.store(true, Ordering::Relaxed);
    }
}

pub(super) fn blocked_on(gate: &Arc<Gate>) -> RemoteRun {
    let gate = gate.clone();
    Arc::new(move |_ctx: &JobContext| {
        poll_until(|| gate.0.load(Ordering::Relaxed));
        Ok(())
    })
}

fn poll_until(ready: impl Fn() -> bool) {
    while !ready() {
        std::thread::sleep(POLL);
    }
}

pub(super) async fn wait_idle(mgr: &Arc<JobManager>) {
    for _ in 0..300 {
        if mgr.running_count() == 0 {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    panic!("job run did not finish within the timeout");
}
