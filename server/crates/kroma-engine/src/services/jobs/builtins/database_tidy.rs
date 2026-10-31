//! `database.tidy`: drops the rows that only grow (expired sessions and device
//! tokens, pipeline work whose subject is gone), then gives SQLite its upkeep.

use super::prelude::*;

use crate::db::housekeeping;

pub(super) const SPEC: Builtin = Builtin {
    key: JobKey("database.tidy"),
    category: Category::Maintenance,
    schedule: Some("30 4 * * *"),
    triggers: &[],
    run,
};

pub(super) fn run(ctx: &JobContext) -> Result<()> {
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    let tidied = housekeeping::tidy(&ctx.state.db, now)?;
    ctx.info(format!(
        "removed {} expired sessions, {} expired device tokens, {} pipeline tasks whose subject is gone, {} push records and {} daily flow tallies past their retention",
        tidied.sessions, tidied.access_tokens, tidied.pipeline_tasks, tidied.deliveries, tidied.flow_tallies
    ));
    housekeeping::optimize(&ctx.state.db)?;
    ctx.info("refreshed the query planner's statistics and checkpointed the write-ahead log");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::test_state;

    #[test]
    fn a_run_removes_an_expired_session() {
        let state = test_state();
        let conn = state.db.get().unwrap();
        conn.execute_batch(
            "INSERT INTO users (id, email, username, password_hash, created_at) \
                 VALUES ('u-tidy', 'tidy@b.c', 'tidy', 'x', '2026-01-01');
             INSERT INTO sessions (token, user_id, created_at, expires_at) \
                 VALUES ('expired', 'u-tidy', '2026-01-01', 1);",
        )
        .unwrap();
        drop(conn);

        run(&JobContext::for_test(state.clone())).unwrap();

        let left: i64 = state
            .db
            .get()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM sessions WHERE token = 'expired'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(left, 0);
    }
}
