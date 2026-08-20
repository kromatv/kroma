use std::sync::Arc;

use crate::db::testing::TempPool;
use crate::model::Category;

use super::{Builtin, JobContext, JobKey, JobManager, Trigger};

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

pub(super) async fn wait_idle(mgr: &Arc<JobManager>) {
    for _ in 0..300 {
        if mgr.running_count() == 0 {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    panic!("job run did not finish within the timeout");
}
