use rusqlite::{params, Connection};

use crate::testing::TempPool;

pub(super) fn pool() -> TempPool {
    crate::testing::temp_pool("pq")
}

pub(super) fn task(
    conn: &Connection,
    stage: &str,
    id: &str,
    status: &str,
    error: Option<&str>,
    finished: Option<i64>,
) {
    conn.execute(
        "INSERT INTO pipeline_tasks (stage,subject_kind,subject_id,status,error,attempts,enqueued_at,updated_at,finished_at) \
         VALUES (?1,'file',?2,?3,?4,1,0,0,?5)",
        params![stage, id, status, error, finished],
    )
    .unwrap();
}
