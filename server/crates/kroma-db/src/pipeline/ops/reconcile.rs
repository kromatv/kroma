//! Bringing a stage's ledger in line with what was just enumerated.

use std::collections::{HashMap, HashSet};

use anyhow::Result;
use rusqlite::{params, TransactionBehavior};

use crate::pool::Pool;
use super::{Subject, MAX_ATTEMPTS, UNREADABLE_SIG};

/// Reconcile a stage's ledger against the freshly-enumerated `subjects` (one
/// transaction). Insert missing subjects as `pending`; re-`pending` any whose
/// signature changed; retry `failed` rows under [`MAX_ATTEMPTS`]; delete rows for
/// subjects that no longer exist. `done`-and-unchanged and `running` rows are
/// left untouched.
pub fn reconcile(
    pool: &Pool,
    stage: &str,
    subject_kind: &str,
    subjects: &[Subject],
    now: i64,
) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let existing: HashMap<String, (Option<String>, String, i64, Option<i64>)> = {
        let mut stmt = tx.prepare(
            "SELECT subject_id, input_sig, status, attempts, next_retry_at \
             FROM pipeline_tasks WHERE stage=?1",
        )?;
        let rows = stmt.query_map(params![stage], |r| {
            Ok((
                r.get::<_, String>(0)?,
                (
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, Option<i64>>(4)?,
                ),
            ))
        })?;
        rows.collect::<rusqlite::Result<HashMap<_, _>>>()?
    };
    let present: HashSet<&str> = subjects.iter().map(|(id, _)| id.as_str()).collect();
    for (id, sig) in subjects {
        reconcile_subject(&tx, stage, subject_kind, id, sig, existing.get(id), now)?;
    }
    for id in existing.keys() {
        if !present.contains(id.as_str()) {
            tx.execute(
                "DELETE FROM pipeline_tasks WHERE stage=?1 AND subject_id=?2",
                params![stage, id],
            )?;
        }
    }
    tx.commit()?;
    Ok(())
}

type ExistingTask = (Option<String>, String, i64, Option<i64>);

fn reconcile_subject(
    tx: &rusqlite::Transaction,
    stage: &str,
    subject_kind: &str,
    id: &str,
    sig: &str,
    existing: Option<&ExistingTask>,
    now: i64,
) -> Result<()> {
    match existing {
        None => {
            // Unreadable inputs (mount blip): defer the first-ever processing to
            // the next reconcile rather than creating a task from a bad signature.
            if sig != UNREADABLE_SIG {
                tx.execute(
                    "INSERT INTO pipeline_tasks \
                       (stage,subject_kind,subject_id,status,input_sig,attempts,priority,enqueued_at,updated_at) \
                     VALUES (?1,?2,?3,'pending',?4,0,0,?5,?5)",
                    params![stage, subject_kind, id, sig, now],
                )?;
            }
        }
        Some((old_sig, status, attempts, next_retry_at)) => {
            reconcile_existing(
                tx,
                stage,
                subject_kind,
                id,
                sig,
                old_sig,
                status,
                *attempts,
                *next_retry_at,
                now,
            )?;
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn reconcile_existing(
    tx: &rusqlite::Transaction,
    stage: &str,
    subject_kind: &str,
    id: &str,
    sig: &str,
    old_sig: &Option<String>,
    status: &str,
    attempts: i64,
    next_retry_at: Option<i64>,
    now: i64,
) -> Result<()> {
    if status == "running" {
        return Ok(());
    }
    // Never a changed signature, or a flapping mount would re-queue the whole
    // library on every blip.
    if sig == UNREADABLE_SIG {
        return Ok(());
    }
    // A NULL old sig (a task from `enqueue`, which omits input_sig) is not a
    // change, or a just-finished reprocess would be re-run once more here.
    let sig_changed = old_sig.is_some() && old_sig.as_deref() != Some(sig);
    if sig_changed {
        tx.execute(
            "UPDATE pipeline_tasks SET status='pending', input_sig=?4, attempts=0, \
               error=NULL, next_retry_at=NULL, enqueued_at=?5, updated_at=?5 \
             WHERE stage=?1 AND subject_kind=?2 AND subject_id=?3",
            params![stage, subject_kind, id, sig, now],
        )?;
        return Ok(());
    }
    if old_sig.is_none() {
        tx.execute(
            "UPDATE pipeline_tasks SET input_sig=?4, updated_at=?5 \
             WHERE stage=?1 AND subject_kind=?2 AND subject_id=?3",
            params![stage, subject_kind, id, sig, now],
        )?;
    }
    let backoff_elapsed = next_retry_at.is_none_or(|t| t <= now);
    if status == "failed" && attempts < MAX_ATTEMPTS && backoff_elapsed {
        tx.execute(
            "UPDATE pipeline_tasks SET status='pending', updated_at=?4 \
             WHERE stage=?1 AND subject_kind=?2 AND subject_id=?3",
            params![stage, subject_kind, id, now],
        )?;
    }
    Ok(())
}

/// Force one subject to `pending` at (at least) `priority`, inserting the task if
/// it doesn't exist yet. The signature is left for the stage's next reconcile to
/// normalize.
pub fn enqueue(
    pool: &Pool,
    stage: &str,
    subject_kind: &str,
    id: &str,
    priority: i64,
    now: i64,
) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO pipeline_tasks \
           (stage,subject_kind,subject_id,status,attempts,priority,enqueued_at,updated_at) \
         VALUES (?1,?2,?3,'pending',0,?4,?5,?5) \
         ON CONFLICT(stage,subject_kind,subject_id) DO UPDATE SET \
           status='pending', attempts=0, error=NULL, next_retry_at=NULL, \
           priority=MAX(priority, excluded.priority), \
           enqueued_at=excluded.enqueued_at, updated_at=excluded.updated_at",
        params![stage, subject_kind, id, priority, now],
    )?;
    Ok(())
}

/// Force every settled task of `stage` back to `pending`, clearing the stored
/// signature, so the stage rebuilds the whole set on its next run. For when the
/// stage's on-disk outputs were wiped out of band: the signature-based skip
/// cannot see a missing output. Leaves `pending`/`running` alone.
pub fn requeue_stage(pool: &Pool, stage: &str, now: i64) -> Result<usize> {
    let conn = pool.get()?;
    let n = conn.execute(
        "UPDATE pipeline_tasks SET status='pending', attempts=0, error=NULL, input_sig=NULL, \
           next_retry_at=NULL, updated_at=?2 \
         WHERE stage=?1 AND status IN ('done','failed','blocked')",
        params![stage, now],
    )?;
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::ops::test_support::*;
    use crate::pipeline::ops::{claim_batch, finish_batch};

    #[test]
    fn enqueue_is_idempotent_and_keeps_the_higher_priority() {
        let p = pool();
        enqueue(&p, "probe", "item", "a", 5, 1).unwrap();
        enqueue(&p, "probe", "item", "a", 1, 2).unwrap();
        assert_eq!(row(&p, "probe", "a"), ("pending".to_string(), 0, 5));
    }

    #[test]
    fn enqueue_revives_a_settled_task() {
        let p = pool();
        enqueue(&p, "probe", "item", "a", 0, 1).unwrap();
        claim_batch(&p, "probe", 10, 2).unwrap();
        finish_batch(&p, "probe", &[failed("a", "boom")], 3).unwrap();
        assert_eq!(row(&p, "probe", "a").0, "failed");

        enqueue(&p, "probe", "item", "a", 0, 4).unwrap();
        let (status, attempts, _) = row(&p, "probe", "a");
        assert_eq!(status, "pending");
        assert_eq!(attempts, 0);
        assert!(next_retry_at(&p, "probe", "a").is_none());
    }

    #[test]
    fn requeue_stage_clears_the_signature_so_the_skip_cannot_hold() {
        let p = pool();
        enqueue(&p, "probe", "item", "a", 0, 1).unwrap();
        claim_batch(&p, "probe", 10, 2).unwrap();
        finish_batch(&p, "probe", &[ok("a")], 3).unwrap();
        p.get()
            .unwrap()
            .execute("UPDATE pipeline_tasks SET input_sig='sig' WHERE subject_id='a'", [])
            .unwrap();

        assert_eq!(requeue_stage(&p, "probe", 10).unwrap(), 1);
        assert_eq!(row(&p, "probe", "a").0, "pending");
        let sig: Option<String> = p
            .get()
            .unwrap()
            .query_row("SELECT input_sig FROM pipeline_tasks WHERE subject_id='a'", [], |r| r.get(0))
            .unwrap();
        assert!(sig.is_none());
    }

    #[test]
    fn requeue_stage_leaves_pending_and_running_alone() {
        let p = pool();
        enqueue(&p, "probe", "item", "pending1", 0, 1).unwrap();
        enqueue(&p, "probe", "item", "running1", 0, 1).unwrap();
        claim_batch(&p, "probe", 1, 2).unwrap();

        assert_eq!(requeue_stage(&p, "probe", 10).unwrap(), 0);
    }

    #[test]
    fn a_refused_update_aborts_the_whole_reconcile_instead_of_half_writing_it() {
        let p = pool();
        reconcile(&p, "probe", "item", &[("m1".into(), "sig-a".into())], 1_000).unwrap();
        p.get()
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER no_update BEFORE UPDATE ON pipeline_tasks \
                 BEGIN SELECT RAISE(ABORT, 'refused'); END",
            )
            .unwrap();

        assert!(reconcile(&p, "probe", "item", &[("m1".into(), "sig-b".into())], 2_000).is_err());
        assert_eq!(row(&p, "probe", "m1").0, "pending");
    }
}
