//! Ledger write / lifecycle operations. Every write here is batched into a
//! single (IMMEDIATE) transaction so the many stage workers never contend on
//! SQLite's single writer. Timestamps are epoch milliseconds.

use std::collections::{HashMap, HashSet};

use rusqlite::TransactionBehavior;

use crate::*;

/// How many times a failed task is auto-retried across drains before it sticks
/// as `failed` (and waits for a manual retry). Transient blips (a locked file, a
/// momentary TMDB hiccup) clear on the next run; a genuinely broken subject stops
/// churning.
pub const MAX_ATTEMPTS: i64 = 3;

/// Base delay of the retry backoff (5 minutes). A task failing its Nth attempt
/// may not be auto-retried before `now + retry_backoff_ms(N)`.
const RETRY_BASE_MS: i64 = 5 * 60 * 1000;

/// Quadratic backoff between auto-retries: attempt 1 -> 5 min, attempt 2 ->
/// 20 min (attempt 3 sticks as `failed`, so no further delay matters). Nightly
/// drains are unaffected (the gap between drains dwarfs this); what it prevents
/// is a manually re-kicked stage hammering a flaky dependency (a locked file, a
/// rate-limited TMDB) with back-to-back retries seconds apart.
pub fn retry_backoff_ms(attempts: i64) -> i64 {
    RETRY_BASE_MS * attempts * attempts
}

/// Sentinel signature meaning "the subject's inputs were unreadable at enumerate
/// time" (e.g. the media mount was briefly offline). `reconcile` treats it as
/// "leave this task exactly as it is": never a changed input, never a fresh
/// insert. Without this, a flapping mount flips every file's real `mtime:size`
/// signature to this and back, re-queueing the WHOLE library through the heavy
/// stages twice per blip. Stage `enumerate`s emit it via
/// `services::pipeline::stages::sig_for_path` (and markers when any episode is
/// unreadable). The value can never collide with a real signature (`digits:digits`
/// for a file, a hex hash for a season, a bare number for embeddings).
pub const UNREADABLE_SIG: &str = "\u{0}unreadable";

/// A unit of work: the subject's id + a signature of its current inputs. A task
/// is skipped while `status='done'` and its stored signature still matches, and
/// re-queued the moment the signature changes.
pub type Subject = (String, String);

/// Reconcile a stage's ledger against the freshly-enumerated `subjects` (one
/// transaction). Insert missing subjects as `pending`; re-`pending` any whose
/// signature changed; give `failed` rows with attempts `< MAX_ATTEMPTS` another
/// try (bounded auto-retry); delete rows for subjects that no longer exist. Rows
/// that are `done` with an unchanged signature are left untouched that is the
/// incremental skip. `running` rows are never disturbed.
pub fn reconcile(
    pool: &Pool,
    stage: &str,
    subject_kind: &str,
    subjects: &[Subject],
    now: i64,
) -> Result<()> {
    let mut conn = pool.get()?;
    // IMMEDIATE so we take the write lock at BEGIN: a read-then-write (deferred)
    // transaction can't upgrade while another connection is writing and fails
    // `SQLITE_BUSY` instead of waiting. With IMMEDIATE, `busy_timeout` serializes
    // concurrent stage drains (which happen when several stages run at once, e.g.
    // a reprocess) rather than erroring one of them out.
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

/// Reconcile one enumerated subject against its existing ledger row (if any).
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
            // Inputs unreadable right now (mount blip): do not create a task yet.
            // The subject reappears on the next reconcile once readable, so this
            // only defers the first-ever processing, never drops it.
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

/// Reconcile a subject that already has a ledger row (the `Some` arm).
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
    // Inputs unreadable right now: leave the task exactly as it is (a `done`
    // stays done). Never treat this as a changed signature, or a flapping mount
    // would re-queue the whole library on every blip. The subject is still in
    // `present`, so it is not deleted.
    if sig == UNREADABLE_SIG {
        return Ok(());
    }
    // Only a PRESENT-but-different signature means the inputs changed: a
    // NULL/unknown old sig (e.g. a task enqueued by `enqueue`, which omits
    // input_sig) must NOT be treated as a change, or a just-finished reprocess
    // would be re-run once more here. It is instead backfilled below without
    // disturbing status.
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
    // Backfill a missing signature so it stops looking "changed" on the next
    // reconcile. Never resets status/priority.
    if old_sig.is_none() {
        tx.execute(
            "UPDATE pipeline_tasks SET input_sig=?4, updated_at=?5 \
             WHERE stage=?1 AND subject_kind=?2 AND subject_id=?3",
            params![stage, subject_kind, id, sig, now],
        )?;
    }
    // Bounded auto-retry for transient failures, gated by the backoff window
    // `finish_batch` stamped on the failure.
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
/// it doesn't exist yet. Used by "reprocess this element": the higher priority
/// makes it jump the routine backlog, and the signature is left for the stage's
/// next reconcile to normalize.
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

/// Force every settled task of `stage` back to `pending` so the stage rebuilds
/// the whole set on its next run. Used when the stage's on-disk outputs were wiped
/// out of band (admin "clear cache" / "reset metadata"): the signature-based skip
/// cannot see a missing output, so without this the ledger stays `done` and the
/// files never come back. Leaves `pending`/`running` alone and clears the stored
/// signature so the next reconcile re-signs from scratch. Returns how many were
/// re-queued.
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

/// Claim up to `limit` pending tasks for a stage: pick the highest-priority /
/// oldest, flip them to `running`, and return `(subject_id, input_sig)` for the
/// worker pool. One transaction, so a second claimer (there is none per stage the
/// one-run-per-key rule guarantees it) could never double-claim.
pub fn claim_batch(pool: &Pool, stage: &str, limit: usize, now: i64) -> Result<Vec<Subject>> {
    let mut conn = pool.get()?;
    // IMMEDIATE so we take the write lock at BEGIN: a read-then-write (deferred)
    // transaction can't upgrade while another connection is writing and fails
    // `SQLITE_BUSY` instead of waiting. With IMMEDIATE, `busy_timeout` serializes
    // concurrent stage drains (which happen when several stages run at once, e.g.
    // a reprocess) rather than erroring one of them out.
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

/// The outcome of processing one claimed task.
pub struct TaskResult {
    pub id: String,
    /// `None` = success; `Some(msg)` = failed with this error.
    pub error: Option<String>,
    pub duration_ms: i64,
}

/// Write a batch of results back (one transaction). Success → `done`; failure →
/// `failed` with `attempts` incremented (a later reconcile retries it while under
/// [`MAX_ATTEMPTS`]).
pub fn finish_batch(pool: &Pool, stage: &str, results: &[TaskResult], now: i64) -> Result<()> {
    let mut conn = pool.get()?;
    // IMMEDIATE so we take the write lock at BEGIN: a read-then-write (deferred)
    // transaction can't upgrade while another connection is writing and fails
    // `SQLITE_BUSY` instead of waiting. With IMMEDIATE, `busy_timeout` serializes
    // concurrent stage drains (which happen when several stages run at once, e.g.
    // a reprocess) rather than erroring one of them out.
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    for r in results {
        match &r.error {
            None => tx.execute(
                "UPDATE pipeline_tasks SET status='done', error=NULL, next_retry_at=NULL, \
                   finished_at=?3, duration_ms=?4, updated_at=?3 WHERE stage=?1 AND subject_id=?2",
                params![stage, r.id, now, r.duration_ms],
            )?,
            // `attempts` on the right-hand side reads the pre-update value, so the
            // backoff is computed from the attempt number this failure completes.
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

/// Flip `running` tasks back to `pending`, for a stage or all stages. Called at
/// startup (crash recovery, mirroring `reconcile_running_runs`) and at the end of
/// a cancelled drain so claimed-but-unprocessed tasks aren't stranded `running`.
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

/// Priority given to a manually-retried task so it jumps ahead of the routine
/// (priority 0) backlog on the next claim. Matches the reprocess fast-track tier.
pub const RETRY_PRIORITY: i64 = 100;

/// Reset `failed` tasks back to `pending` (attempts cleared) for a manual retry:
/// the whole stage (`subject_id = None`) or one task. Bumps priority so the retry
/// is claimed BEFORE the normal backlog (claim orders `priority DESC`).
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

/// Force a full re-run of a stage: every non-running task back to `pending`. The
/// per-artifact skip still lives in each stage's `enumerate`/`process` (e.g. a
/// cached storyboard is a no-op), so this re-invokes the stage over all subjects
/// rather than deleting cached artifacts.
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
    use std::sync::atomic::{AtomicU32, Ordering};

    use super::*;

    static SEQ: AtomicU32 = AtomicU32::new(0);

    fn pool() -> Pool {
        let n = SEQ.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("kroma-ops-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        crate::init(&path).unwrap()
    }

    /// One task's `(status, attempts, priority)`.
    fn row(p: &Pool, stage: &str, id: &str) -> (String, i64, i64) {
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

    fn next_retry_at(p: &Pool, stage: &str, id: &str) -> Option<i64> {
        p.get()
            .unwrap()
            .query_row(
                "SELECT next_retry_at FROM pipeline_tasks WHERE stage=?1 AND subject_id=?2",
                params![stage, id],
                |r| r.get(0),
            )
            .unwrap()
    }

    fn ok(id: &str) -> TaskResult {
        TaskResult { id: id.into(), error: None, duration_ms: 5 }
    }

    fn failed(id: &str, msg: &str) -> TaskResult {
        TaskResult { id: id.into(), error: Some(msg.into()), duration_ms: 5 }
    }

    #[test]
    fn backoff_grows_quadratically() {
        // 5 min, then 20 min. A manually re-kicked stage must not hammer a flaky
        // dependency with back-to-back retries seconds apart.
        assert_eq!(retry_backoff_ms(1), 5 * 60 * 1000);
        assert_eq!(retry_backoff_ms(2), 20 * 60 * 1000);
        assert!(retry_backoff_ms(2) > retry_backoff_ms(1));
    }

    #[test]
    fn enqueue_is_idempotent_and_keeps_the_higher_priority() {
        let p = pool();
        enqueue(&p, "probe", "item", "a", 5, 1).unwrap();
        enqueue(&p, "probe", "item", "a", 1, 2).unwrap();
        // Re-enqueueing the same subject must not create a second task, and must
        // not DOWNGRADE a priority someone raised deliberately.
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
        // Back to pending with a CLEAN slate: the subject changed, so the old
        // failure and its attempt count no longer describe it.
        let (status, attempts, _) = row(&p, "probe", "a");
        assert_eq!(status, "pending");
        assert_eq!(attempts, 0);
        assert!(next_retry_at(&p, "probe", "a").is_none());
    }

    #[test]
    fn claim_takes_the_highest_priority_then_the_oldest() {
        let p = pool();
        enqueue(&p, "probe", "item", "old", 0, 1).unwrap();
        enqueue(&p, "probe", "item", "new", 0, 2).unwrap();
        enqueue(&p, "probe", "item", "urgent", 9, 3).unwrap();

        let picked = claim_batch(&p, "probe", 2, 10).unwrap();
        let ids: Vec<&str> = picked.iter().map(|(id, _)| id.as_str()).collect();
        // Priority first, then FIFO among equals - so a manual retry jumps the
        // queue but two ordinary tasks keep their order.
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

        // Already running: a second drain of the same stage must not re-take it.
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
        // A stale next_retry_at on a done task would make a later reconcile think
        // it is still waiting to be retried.
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
        // The backoff is computed from the attempt this failure COMPLETES, so the
        // first failure waits 5 minutes rather than 0.
        assert_eq!(next_retry_at(&p, "probe", "a"), Some(1_000 + retry_backoff_ms(1)));

        retry(&p, "probe", Some("a")).unwrap();
        claim_batch(&p, "probe", 10, 2_000).unwrap();
        finish_batch(&p, "probe", &[failed("a", "again")], 2_000).unwrap();
        // `retry` resets attempts, so this is attempt 1 again - the counter tracks
        // consecutive automatic failures, not lifetime ones.
        assert_eq!(row(&p, "probe", "a").1, 1);
    }

    #[test]
    fn reset_running_rescues_tasks_stranded_by_a_crash() {
        let p = pool();
        enqueue(&p, "probe", "item", "a", 0, 1).unwrap();
        enqueue(&p, "thumbs", "item", "b", 0, 1).unwrap();
        claim_batch(&p, "probe", 10, 2).unwrap();
        claim_batch(&p, "thumbs", 10, 2).unwrap();

        // Scoped to one stage...
        assert_eq!(reset_running(&p, Some("probe")).unwrap(), 1);
        assert_eq!(row(&p, "probe", "a").0, "pending");
        assert_eq!(row(&p, "thumbs", "b").0, "running");

        // ...or every stage, which is what startup does after a crash: a task
        // left `running` by a killed process is claimed by nobody, forever.
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
        // A human asked for this one, so it goes ahead of the routine backlog.
        assert!(priority > 0);
        // The successful task is left alone: retrying it would redo finished work.
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
        // Requeueing a task a worker is mid-way through would run it twice.
        assert_eq!(row(&p, "probe", "running1").0, "running");
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
        // The outputs were wiped out of band, and the signature-based skip cannot
        // see a missing file - so leaving the signature means the files never
        // come back.
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

        // Only settled tasks are rebuilt; the other two are already going to run.
        assert_eq!(requeue_stage(&p, "probe", 10).unwrap(), 0);
    }
}
