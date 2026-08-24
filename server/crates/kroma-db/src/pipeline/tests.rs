use super::ops::{retry_backoff_ms, Subject, MAX_ATTEMPTS};
use super::*;
use crate::testing::TempPool;
use crate::Pool;

fn pool() -> TempPool {
    crate::testing::temp_pool("pipe")
}

// `(pending, running, done, failed, blocked)` for the test stage.
fn c(p: &Pool) -> (i64, i64, i64, i64, i64) {
    counts(p, "s").unwrap()
}

fn subj(pairs: &[(&str, &str)]) -> Vec<Subject> {
    pairs
        .iter()
        .map(|(id, sig)| (id.to_string(), sig.to_string()))
        .collect()
}

#[test]
fn reconcile_is_incremental_and_idempotent() {
    let p = pool();
    let s = subj(&[("a", "v1"), ("b", "v1")]);

    reconcile(&p, "s", "item", &s, 1).unwrap();
    assert_eq!(c(&p), (2, 0, 0, 0, 0));

    let batch = claim_batch(&p, "s", 10, 2).unwrap();
    assert_eq!(batch.len(), 2);
    let ok: Vec<TaskResult> = batch
        .iter()
        .map(|(id, _)| TaskResult {
            id: id.clone(),
            error: None,
            duration_ms: 1,
        })
        .collect();
    finish_batch(&p, "s", &ok, 3).unwrap();
    assert_eq!(c(&p), (0, 0, 2, 0, 0));

    reconcile(&p, "s", "item", &s, 4).unwrap();
    assert_eq!(c(&p), (0, 0, 2, 0, 0));
    assert!(claim_batch(&p, "s", 10, 5).unwrap().is_empty());

    reconcile(&p, "s", "item", &subj(&[("a", "v2"), ("b", "v1")]), 6).unwrap();
    assert_eq!(c(&p), (1, 0, 1, 0, 0));
    let re = claim_batch(&p, "s", 10, 7).unwrap();
    assert_eq!(re, vec![("a".to_string(), "v2".to_string())]);

    reconcile(&p, "s", "item", &subj(&[("b", "v1")]), 8).unwrap();
    let all: i64 = {
        let conn = p.get().unwrap();
        conn.query_row(
            "SELECT COUNT(*) FROM pipeline_tasks WHERE subject_id='a'",
            [],
            |r| r.get(0),
        )
        .unwrap()
    };
    assert_eq!(all, 0);
}

#[test]
fn a_task_a_worker_already_claimed_is_left_alone_when_its_input_changes() {
    let p = pool();
    reconcile(&p, "s", "item", &subj(&[("a", "v1")]), 1).unwrap();
    assert_eq!(
        claim_batch(&p, "s", 10, 2).unwrap(),
        vec![("a".to_string(), "v1".to_string())]
    );
    assert_eq!(c(&p), (0, 1, 0, 0, 0));

    reconcile(&p, "s", "item", &subj(&[("a", "v2")]), 3).unwrap();
    assert_eq!(c(&p), (0, 1, 0, 0, 0));
    let sig: Option<String> = p
        .get()
        .unwrap()
        .query_row(
            "SELECT input_sig FROM pipeline_tasks WHERE stage='s' AND subject_id='a'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(sig.as_deref(), Some("v1"));
}

#[test]
fn failures_retry_up_to_max_then_stick() {
    let p = pool();
    reconcile(&p, "s", "item", &subj(&[("a", "v1")]), 1).unwrap();

    for i in 0..MAX_ATTEMPTS {
        let batch = claim_batch(&p, "s", 10, 10 + i).unwrap();
        assert_eq!(
            batch.len(),
            1,
            "attempt {i} should have a pending task to claim"
        );
        let failed_at = 20 + i;
        finish_batch(
            &p,
            "s",
            &[TaskResult {
                id: "a".into(),
                error: Some("boom".into()),
                duration_ms: 1,
            }],
            failed_at,
        )
        .unwrap();
        reconcile(
            &p,
            "s",
            "item",
            &subj(&[("a", "v1")]),
            failed_at + retry_backoff_ms(i + 1),
        )
        .unwrap();
    }
    assert_eq!(c(&p), (0, 0, 0, 1, 0));
    assert!(claim_batch(&p, "s", 10, 99).unwrap().is_empty());

    assert_eq!(retry(&p, "s", Some("a")).unwrap(), 1);
    assert_eq!(c(&p), (1, 0, 0, 0, 0));
}

#[test]
fn auto_retry_waits_for_the_backoff_window() {
    let p = pool();
    reconcile(&p, "s", "item", &subj(&[("a", "v1")]), 1).unwrap();
    claim_batch(&p, "s", 10, 2).unwrap();
    finish_batch(
        &p,
        "s",
        &[TaskResult {
            id: "a".into(),
            error: Some("boom".into()),
            duration_ms: 1,
        }],
        3,
    )
    .unwrap();

    reconcile(&p, "s", "item", &subj(&[("a", "v1")]), 4).unwrap();
    assert_eq!(c(&p), (0, 0, 0, 1, 0));

    reconcile(
        &p,
        "s",
        "item",
        &subj(&[("a", "v1")]),
        3 + retry_backoff_ms(1),
    )
    .unwrap();
    assert_eq!(c(&p), (1, 0, 0, 0, 0));
}

#[test]
fn changed_signature_requeues_despite_backoff() {
    let p = pool();
    reconcile(&p, "s", "item", &subj(&[("a", "v1")]), 1).unwrap();
    claim_batch(&p, "s", 10, 2).unwrap();
    finish_batch(
        &p,
        "s",
        &[TaskResult {
            id: "a".into(),
            error: Some("boom".into()),
            duration_ms: 1,
        }],
        3,
    )
    .unwrap();

    reconcile(&p, "s", "item", &subj(&[("a", "v2")]), 4).unwrap();
    assert_eq!(c(&p), (1, 0, 0, 0, 0));
}

#[test]
fn manual_retry_ignores_the_backoff_window() {
    let p = pool();
    reconcile(&p, "s", "item", &subj(&[("a", "v1")]), 1).unwrap();
    claim_batch(&p, "s", 10, 2).unwrap();
    finish_batch(
        &p,
        "s",
        &[TaskResult {
            id: "a".into(),
            error: Some("boom".into()),
            duration_ms: 1,
        }],
        3,
    )
    .unwrap();

    assert_eq!(retry(&p, "s", Some("a")).unwrap(), 1);
    assert_eq!(c(&p), (1, 0, 0, 0, 0));
    let batch = claim_batch(&p, "s", 10, 4).unwrap();
    assert_eq!(batch.len(), 1);
}

#[test]
fn manual_retry_jumps_the_queue() {
    let p = pool();
    reconcile(&p, "s", "item", &subj(&[("routine", "v1")]), 1).unwrap();
    {
        let conn = p.get().unwrap();
        conn.execute(
            "INSERT INTO pipeline_tasks(stage,subject_kind,subject_id,status,attempts,priority,enqueued_at,updated_at) \
             VALUES ('s','item','boom','failed',1,0,0,0)",
            [],
        )
        .unwrap();
    }
    assert_eq!(retry(&p, "s", Some("boom")).unwrap(), 1);
    let batch = claim_batch(&p, "s", 1, 5).unwrap();
    assert_eq!(
        batch.iter().map(|(id, _)| id.as_str()).collect::<Vec<_>>(),
        vec!["boom"]
    );
}

#[test]
fn enqueue_null_sig_is_backfilled_not_rerun() {
    let p = pool();
    // `enqueue` inserts with input_sig = NULL.
    enqueue(&p, "s", "item", "a", 100, 1).unwrap();
    let batch = claim_batch(&p, "s", 10, 2).unwrap();
    assert_eq!(batch.len(), 1);
    finish_batch(
        &p,
        "s",
        &[TaskResult {
            id: "a".into(),
            error: None,
            duration_ms: 1,
        }],
        3,
    )
    .unwrap();
    assert_eq!(c(&p), (0, 0, 1, 0, 0));

    reconcile(&p, "s", "item", &subj(&[("a", "v1")]), 4).unwrap();
    assert_eq!(c(&p), (0, 0, 1, 0, 0));
    assert!(claim_batch(&p, "s", 10, 5).unwrap().is_empty());

    reconcile(&p, "s", "item", &subj(&[("a", "v1")]), 6).unwrap();
    assert_eq!(c(&p), (0, 0, 1, 0, 0));
    reconcile(&p, "s", "item", &subj(&[("a", "v2")]), 7).unwrap();
    assert_eq!(c(&p), (1, 0, 0, 0, 0));
}

#[test]
fn reset_running_recovers_stranded_tasks() {
    let p = pool();
    reconcile(&p, "s", "item", &subj(&[("a", "v1"), ("b", "v1")]), 1).unwrap();
    claim_batch(&p, "s", 10, 2).unwrap();
    assert_eq!(c(&p), (0, 2, 0, 0, 0));
    assert_eq!(reset_running(&p, None).unwrap(), 2);
    assert_eq!(c(&p), (2, 0, 0, 0, 0));
}

#[test]
fn unreadable_signature_never_requeues_or_deletes() {
    let p = pool();
    reconcile(&p, "s", "item", &subj(&[("a", "v1")]), 1).unwrap();
    let batch = claim_batch(&p, "s", 10, 2).unwrap();
    let ok: Vec<TaskResult> = batch
        .iter()
        .map(|(id, _)| TaskResult {
            id: id.clone(),
            error: None,
            duration_ms: 1,
        })
        .collect();
    finish_batch(&p, "s", &ok, 3).unwrap();
    assert_eq!(c(&p), (0, 0, 1, 0, 0));

    reconcile(&p, "s", "item", &subj(&[("a", UNREADABLE_SIG)]), 4).unwrap();
    assert_eq!(c(&p), (0, 0, 1, 0, 0));
    assert!(claim_batch(&p, "s", 10, 5).unwrap().is_empty());

    // The stored sig was never overwritten by the sentinel, so no recompute.
    reconcile(&p, "s", "item", &subj(&[("a", "v1")]), 6).unwrap();
    assert_eq!(c(&p), (0, 0, 1, 0, 0));
    assert!(claim_batch(&p, "s", 10, 7).unwrap().is_empty());
}

#[test]
fn requeue_stage_rebuilds_done_tasks_after_cache_wipe() {
    let p = pool();
    reconcile(&p, "s", "item", &subj(&[("a", "v1"), ("b", "v1")]), 1).unwrap();
    let batch = claim_batch(&p, "s", 10, 2).unwrap();
    let ok: Vec<TaskResult> = batch
        .iter()
        .map(|(id, _)| TaskResult {
            id: id.clone(),
            error: None,
            duration_ms: 1,
        })
        .collect();
    finish_batch(&p, "s", &ok, 3).unwrap();
    assert_eq!(c(&p), (0, 0, 2, 0, 0));

    assert_eq!(requeue_stage(&p, "s", 4).unwrap(), 2);
    assert_eq!(c(&p), (2, 0, 0, 0, 0));
    assert_eq!(claim_batch(&p, "s", 10, 5).unwrap().len(), 2);
}

#[test]
fn unreadable_brand_new_subject_is_deferred_not_inserted() {
    let p = pool();
    reconcile(&p, "s", "item", &subj(&[("a", UNREADABLE_SIG)]), 1).unwrap();
    assert_eq!(c(&p), (0, 0, 0, 0, 0));
    reconcile(&p, "s", "item", &subj(&[("a", "v1")]), 2).unwrap();
    assert_eq!(c(&p), (1, 0, 0, 0, 0));
}
