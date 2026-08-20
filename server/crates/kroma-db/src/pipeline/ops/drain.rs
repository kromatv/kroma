//! Taking tasks off the ledger, writing their results back, and retrying.

use anyhow::Result;
use rusqlite::{params, TransactionBehavior};

use crate::pool::Pool;
use super::{Subject, RETRY_BASE_MS};

/// Claim up to `limit` pending tasks for a stage: pick the highest-priority /
/// oldest, flip them to `running`, and return `(subject_id, input_sig)` for the
/// worker pool.
pub fn claim_batch(pool: &Pool, stage: &str, limit: usize, now: i64) -> Result<Vec<Subject>> {
    let mut conn = pool.get()?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let picked: Vec<Subject> = {
        let mut stmt = tx.prepare(
            "SELECT subject_id, COALESCE(input_sig,'') FROM pipeline_tasks \
             WHERE stage=?1 AND status='pending' ORDER BY priority DESC, enqueued_at LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![stage, limit as i64], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    for (id, _) in &picked {
        tx.execute(
            "UPDATE pipeline_tasks SET status='running', started_at=?3, updated_at=?3 \
             WHERE stage=?1 AND subject_id=?2",
            params![stage, id, now],
        )?;
    }
    tx.commit()?;
    Ok(picked)
}

/// The outcome of processing one claimed task; `error: None` means success.
pub struct TaskResult {
    pub id: String,
    pub error: Option<String>,
    pub duration_ms: i64,
}

/// Write a batch of results back (one transaction). Success → `done`; failure →
/// `failed` with `attempts` incremented (a later reconcile retries it while under
/// [`MAX_ATTEMPTS`](super::MAX_ATTEMPTS)).
pub fn finish_batch(pool: &Pool, stage: &str, results: &[TaskResult], now: i64) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    for r in results {
        match &r.error {
            None => tx.execute(
                "UPDATE pipeline_tasks SET status='done', error=NULL, next_retry_at=NULL, \
                   finished_at=?3, duration_ms=?4, updated_at=?3 WHERE stage=?1 AND subject_id=?2",
                params![stage, r.id, now, r.duration_ms],
            )?,
            // `attempts` on the right-hand side reads the pre-update value, so the
            // backoff is computed from the attempt this failure completes.
            Some(e) => tx.execute(
                "UPDATE pipeline_tasks SET status='failed', attempts=attempts+1, error=?3, \
                   next_retry_at=?4 + ?6*(attempts+1)*(attempts+1), \
                   finished_at=?4, duration_ms=?5, updated_at=?4 WHERE stage=?1 AND subject_id=?2",
                params![stage, r.id, e, now, r.duration_ms, RETRY_BASE_MS],
            )?,
        };
    }
    tx.commit()?;
    Ok(())
}

/// Flip `running` tasks back to `pending`, for a stage or all stages, so a crash
/// or a cancelled drain cannot strand claimed-but-unprocessed tasks.
pub fn reset_running(pool: &Pool, stage: Option<&str>) -> Result<usize> {
    let conn = pool.get()?;
    let now = kroma_primitives::now_ms();
    let n = match stage {
        Some(s) => conn.execute(
            "UPDATE pipeline_tasks SET status='pending', updated_at=?2 \
             WHERE stage=?1 AND status='running'",
            params![s, now],
        )?,
        None => conn.execute(
            "UPDATE pipeline_tasks SET status='pending', updated_at=?1 WHERE status='running'",
            params![now],
        )?,
    };
    Ok(n)
}

pub const RETRY_PRIORITY: i64 = 100;

/// Reset `failed` tasks back to `pending` (attempts cleared) for a manual retry:
/// the whole stage (`subject_id = None`) or one task. Bumps priority so the retry
/// is claimed before the routine backlog.
pub fn retry(pool: &Pool, stage: &str, subject_id: Option<&str>) -> Result<usize> {
    let conn = pool.get()?;
    let now = kroma_primitives::now_ms();
    let n = match subject_id {
        Some(id) => conn.execute(
            "UPDATE pipeline_tasks SET status='pending', attempts=0, error=NULL, \
               next_retry_at=NULL, priority=MAX(priority, ?3), updated_at=?4 \
             WHERE stage=?1 AND subject_id=?2 AND status='failed'",
            params![stage, id, RETRY_PRIORITY, now],
        )?,
        None => conn.execute(
            "UPDATE pipeline_tasks SET status='pending', attempts=0, error=NULL, \
               next_retry_at=NULL, priority=MAX(priority, ?2), updated_at=?3 \
             WHERE stage=?1 AND status='failed'",
            params![stage, RETRY_PRIORITY, now],
        )?,
    };
    Ok(n)
}

/// Force a full re-run of a stage: every non-running task back to `pending`. This
/// re-invokes the stage over all subjects; it does not delete cached artifacts, so
/// each stage's own per-artifact skip still applies.
pub fn reprocess(pool: &Pool, stage: &str) -> Result<usize> {
    let conn = pool.get()?;
    let now = kroma_primitives::now_ms();
    let n = conn.execute(
        "UPDATE pipeline_tasks SET status='pending', attempts=0, error=NULL, \
           next_retry_at=NULL, updated_at=?2 \
         WHERE stage=?1 AND status!='running'",
        params![stage, now],
    )?;
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::ops::test_support::*;
    use crate::pipeline::ops::{enqueue, retry_backoff_ms};

    #[test]
    fn claim_takes_the_highest_priority_then_the_oldest() {
        let p = pool();
        enqueue(&p, "probe", "item", "old", 0, 1).unwrap();
        enqueue(&p, "probe", "item", "new", 0, 2).unwrap();
        enqueue(&p, "probe", "item", "urgent", 9, 3).unwrap();

        let picked = claim_batch(&p, "probe", 2, 10).unwrap();
        let ids: Vec<&str> = picked.iter().map(|(id, _)| id.as_str()).collect();
        assert_eq!(ids, vec!["urgent", "old"]);
    }

    #[test]
    fn claim_flips_only_what_it_took() {
        let p = pool();
        enqueue(&p, "probe", "item", "a", 0, 1).unwrap();
        enqueue(&p, "probe", "item", "b", 0, 2).unwrap();
        claim_batch(&p, "probe", 1, 10).unwrap();

        assert_eq!(row(&p, "probe", "a").0, "running");
        assert_eq!(row(&p, "probe", "b").0, "pending");
    }

    #[test]
    fn claim_ignores_another_stage_and_anything_not_pending() {
        let p = pool();
        enqueue(&p, "probe", "item", "a", 0, 1).unwrap();
        enqueue(&p, "thumbs", "item", "b", 0, 1).unwrap();
        claim_batch(&p, "probe", 10, 10).unwrap();

        assert!(claim_batch(&p, "probe", 10, 11).unwrap().is_empty());
        assert_eq!(row(&p, "thumbs", "b").0, "pending");
    }

    #[test]
    fn finishing_a_success_clears_the_error_and_the_backoff() {
        let p = pool();
        enqueue(&p, "probe", "item", "a", 0, 1).unwrap();
        claim_batch(&p, "probe", 10, 2).unwrap();
        finish_batch(&p, "probe", &[failed("a", "boom")], 3).unwrap();
        retry(&p, "probe", Some("a")).unwrap();
        claim_batch(&p, "probe", 10, 4).unwrap();
        finish_batch(&p, "probe", &[ok("a")], 5).unwrap();

        assert_eq!(row(&p, "probe", "a").0, "done");
        assert!(next_retry_at(&p, "probe", "a").is_none());
    }

    #[test]
    fn each_failure_counts_an_attempt_and_backs_off_further() {
        let p = pool();
        enqueue(&p, "probe", "item", "a", 0, 1).unwrap();
        claim_batch(&p, "probe", 10, 2).unwrap();
        finish_batch(&p, "probe", &[failed("a", "boom")], 1_000).unwrap();

        let (status, attempts, _) = row(&p, "probe", "a");
        assert_eq!((status.as_str(), attempts), ("failed", 1));
        // The backoff is computed from the attempt this failure completes, so the
        // first failure waits 5 minutes rather than 0.
        assert_eq!(next_retry_at(&p, "probe", "a"), Some(1_000 + retry_backoff_ms(1)));

        retry(&p, "probe", Some("a")).unwrap();
        claim_batch(&p, "probe", 10, 2_000).unwrap();
        finish_batch(&p, "probe", &[failed("a", "again")], 2_000).unwrap();
        // `retry` resets attempts: the counter tracks consecutive automatic
        // failures, not lifetime ones.
        assert_eq!(row(&p, "probe", "a").1, 1);
    }

    #[test]
    fn reset_running_rescues_tasks_stranded_by_a_crash() {
        let p = pool();
        enqueue(&p, "probe", "item", "a", 0, 1).unwrap();
        enqueue(&p, "thumbs", "item", "b", 0, 1).unwrap();
        claim_batch(&p, "probe", 10, 2).unwrap();
        claim_batch(&p, "thumbs", 10, 2).unwrap();

        assert_eq!(reset_running(&p, Some("probe")).unwrap(), 1);
        assert_eq!(row(&p, "probe", "a").0, "pending");
        assert_eq!(row(&p, "thumbs", "b").0, "running");

        assert_eq!(reset_running(&p, None).unwrap(), 1);
        assert_eq!(row(&p, "thumbs", "b").0, "pending");
    }

    #[test]
    fn retry_touches_only_failed_tasks_and_raises_their_priority() {
        let p = pool();
        enqueue(&p, "probe", "item", "bad", 0, 1).unwrap();
        enqueue(&p, "probe", "item", "good", 0, 1).unwrap();
        claim_batch(&p, "probe", 10, 2).unwrap();
        finish_batch(&p, "probe", &[failed("bad", "boom"), ok("good")], 3).unwrap();

        assert_eq!(retry(&p, "probe", None).unwrap(), 1);
        let (status, attempts, priority) = row(&p, "probe", "bad");
        assert_eq!((status.as_str(), attempts), ("pending", 0));
        assert!(priority > 0);
        assert_eq!(row(&p, "probe", "good").0, "done");
    }

    #[test]
    fn retry_can_name_a_single_subject() {
        let p = pool();
        for id in ["a", "b"] {
            enqueue(&p, "probe", "item", id, 0, 1).unwrap();
        }
        claim_batch(&p, "probe", 10, 2).unwrap();
        finish_batch(&p, "probe", &[failed("a", "x"), failed("b", "y")], 3).unwrap();

        assert_eq!(retry(&p, "probe", Some("a")).unwrap(), 1);
        assert_eq!(row(&p, "probe", "a").0, "pending");
        assert_eq!(row(&p, "probe", "b").0, "failed");
    }

    #[test]
    fn reprocess_requeues_everything_except_what_is_running() {
        let p = pool();
        for id in ["done1", "failed1", "running1"] {
            enqueue(&p, "probe", "item", id, 0, 1).unwrap();
        }
        claim_batch(&p, "probe", 10, 2).unwrap();
        finish_batch(&p, "probe", &[ok("done1"), failed("failed1", "x")], 3).unwrap();

        assert_eq!(reprocess(&p, "probe").unwrap(), 2);
        assert_eq!(row(&p, "probe", "done1").0, "pending");
        assert_eq!(row(&p, "probe", "failed1").0, "pending");
        assert_eq!(row(&p, "probe", "running1").0, "running");
    }
}
