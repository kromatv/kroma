use rusqlite::params;

use crate::pool::Pool;
use crate::testing::TempPool;
use super::TaskResult;

pub(super) fn pool() -> TempPool {
    crate::testing::temp_pool("ops")
}

pub(super) fn row(p: &Pool, stage: &str, id: &str) -> (String, i64, i64) {
    p.get()
        .unwrap()
        .query_row(
            "SELECT status, attempts, priority FROM pipeline_tasks \
             WHERE stage=?1 AND subject_id=?2",
            params![stage, id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap()
}

pub(super) fn next_retry_at(p: &Pool, stage: &str, id: &str) -> Option<i64> {
    p.get()
        .unwrap()
        .query_row(
            "SELECT next_retry_at FROM pipeline_tasks WHERE stage=?1 AND subject_id=?2",
            params![stage, id],
            |r| r.get(0),
        )
        .unwrap()
}

pub(super) fn ok(id: &str) -> TaskResult {
    TaskResult { id: id.into(), error: None, duration_ms: 5 }
}

pub(super) fn failed(id: &str, msg: &str) -> TaskResult {
    TaskResult { id: id.into(), error: Some(msg.into()), duration_ms: 5 }
}
