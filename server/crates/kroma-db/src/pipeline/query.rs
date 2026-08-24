//! Ledger read / status queries: per-stage tallies, per-subject status rollups,
//! and the lean row-mappers that back the pipeline elements list. All read-only.

use std::collections::HashMap;

use anyhow::Result;
use rusqlite::params;

use crate::pool::Pool;
use kroma_domain::{PipelineTaskView, StageStat};

mod elements;

#[cfg(test)]
mod test_support;

pub use elements::*;

/// Per-stage status tally `(pending, running, done, failed, blocked)`.
pub fn counts(pool: &Pool, stage: &str) -> Result<(i64, i64, i64, i64, i64)> {
    let conn = pool.get()?;
    let mut stmt =
        conn.prepare("SELECT status, COUNT(*) FROM pipeline_tasks WHERE stage=?1 GROUP BY status")?;
    let rows = stmt.query_map(params![stage], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
    })?;
    let mut c = [0i64; 5]; // pending, running, done, failed, blocked
    for row in rows {
        let (st, n) = row?;
        match st.as_str() {
            "pending" => c[0] = n,
            "running" => c[1] = n,
            "done" => c[2] = n,
            "failed" => c[3] = n,
            "blocked" => c[4] = n,
            _ => {}
        }
    }
    Ok((c[0], c[1], c[2], c[3], c[4]))
}

/// The `StageStat` for one stage (counts + identity), for the API + WS event.
pub fn stage_stat(pool: &Pool, stage: &str, key: &str, subject_kind: &str) -> Result<StageStat> {
    let (pending, running, done, failed, blocked) = counts(pool, stage)?;
    Ok(StageStat {
        stage: stage.to_string(),
        key: key.to_string(),
        subject_kind: subject_kind.to_string(),
        pending,
        running,
        done,
        failed,
        blocked,
    })
}

/// Every task of one stage as `subject_id -> (status, error)`. Bulk map for the
/// pipeline elements list (overlays the ledger's running/failed/pending states,
/// with the failure message, onto the cheap artifact signals).
pub fn stage_statuses(
    pool: &Pool,
    stage: &str,
) -> Result<HashMap<String, (String, Option<String>)>> {
    let conn = pool.get()?;
    let mut stmt =
        conn.prepare("SELECT subject_id, status, error FROM pipeline_tasks WHERE stage=?1")?;
    let rows = stmt.query_map(params![stage], |r| {
        Ok((
            r.get::<_, String>(0)?,
            (r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?),
        ))
    })?;
    Ok(rows.collect::<rusqlite::Result<HashMap<_, _>>>()?)
}

/// The ledger status of one task, or `None` if no task exists for it yet.
pub fn task_status(pool: &Pool, stage: &str, subject_id: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    let mut stmt =
        conn.prepare("SELECT status FROM pipeline_tasks WHERE stage=?1 AND subject_id=?2")?;
    let mut rows = stmt.query_map(params![stage, subject_id], |r| r.get::<_, String>(0))?;
    match rows.next() {
        Some(r) => Ok(Some(r?)),
        None => Ok(None),
    }
}

/// The "worst" ledger status across several subjects of one stage, by severity
/// (`failed` > `running` > `pending` > `done`), or `None` if none has a task.
/// Used to roll a show's per-episode/per-file tasks up to one treatment state.
/// ONE query over the whole subject set (was N+1: a connection+query per id),
/// backed by the `(stage, subject_id)` index.
pub fn worst_status(pool: &Pool, stage: &str, subject_ids: &[String]) -> Result<Option<String>> {
    if subject_ids.is_empty() {
        return Ok(None);
    }
    let rank = |s: &str| match s {
        "failed" => 4,
        "running" => 3,
        "pending" => 2,
        "done" => 1,
        _ => 0,
    };
    let conn = pool.get()?;
    let placeholders = vec!["?"; subject_ids.len()].join(",");
    let sql = format!(
        "SELECT subject_id, status FROM pipeline_tasks \
         WHERE stage=? AND subject_id IN ({placeholders})"
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut binds: Vec<&str> = Vec::with_capacity(subject_ids.len() + 1);
    binds.push(stage);
    binds.extend(subject_ids.iter().map(String::as_str));
    let rows = stmt.query_map(rusqlite::params_from_iter(binds), |r| r.get::<_, String>(1))?;
    let mut worst: Option<String> = None;
    for st in rows {
        let st = st?;
        if worst.as_deref().is_none_or(|w| rank(&st) > rank(w)) {
            worst = Some(st);
        }
    }
    Ok(worst)
}

/// Failed tasks for a stage's drill-down (newest failure first). `title` is left
/// as the raw id here; the API layer resolves it against the catalog.
pub fn failed_tasks(pool: &Pool, stage: &str, limit: usize) -> Result<Vec<PipelineTaskView>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT subject_kind, subject_id, status, attempts, error, finished_at \
         FROM pipeline_tasks WHERE stage=?1 AND status='failed' \
         ORDER BY finished_at DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![stage, limit as i64], |r| {
        let subject_id: String = r.get(1)?;
        Ok(PipelineTaskView {
            stage: stage.to_string(),
            subject_kind: r.get(0)?,
            title: subject_id.clone(),
            subject_id,
            status: r.get(2)?,
            attempts: r.get(3)?,
            error: r.get(4)?,
            finished_at: r.get(5)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::query::test_support::*;

    #[test]
    fn stage_stat_statuses_and_worst() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            task(&conn, "st", "f1", "done", None, Some(100));
            task(&conn, "st", "f2", "pending", None, None);
            task(&conn, "st", "f3", "failed", Some("boom"), Some(500));
            task(&conn, "st", "f4", "running", None, None);
        }
        let stat = stage_stat(&p, "st", "the-key", "file").unwrap();
        assert_eq!(
            (
                stat.pending,
                stat.running,
                stat.done,
                stat.failed,
                stat.blocked
            ),
            (1, 1, 1, 1, 0)
        );
        assert_eq!(stat.key, "the-key");

        let map = stage_statuses(&p, "st").unwrap();
        assert_eq!(map["f3"], ("failed".to_string(), Some("boom".to_string())));
        assert_eq!(map["f1"].0, "done");

        assert_eq!(
            task_status(&p, "st", "f3").unwrap().as_deref(),
            Some("failed")
        );
        assert!(task_status(&p, "st", "ghost").unwrap().is_none());

        // worst_status ranks failed > running > pending > done.
        assert_eq!(
            worst_status(&p, "st", &["f1".into(), "f2".into(), "f3".into()])
                .unwrap()
                .as_deref(),
            Some("failed")
        );
        assert_eq!(
            worst_status(&p, "st", &["f1".into()]).unwrap().as_deref(),
            Some("done")
        );
        assert!(worst_status(&p, "st", &[]).unwrap().is_none());
        assert!(worst_status(&p, "st", &["ghost".into()]).unwrap().is_none());
    }

    #[test]
    fn a_blocked_task_is_counted_and_ranks_below_every_named_status() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            task(&conn, "st", "f1", "blocked", None, None);
            task(&conn, "st", "f2", "blocked", None, None);
            task(&conn, "st", "f3", "done", None, Some(1));
            task(&conn, "st", "f4", "quarantined", None, None);
        }
        let stat = stage_stat(&p, "st", "k", "file").unwrap();
        assert_eq!(
            (
                stat.pending,
                stat.running,
                stat.done,
                stat.failed,
                stat.blocked
            ),
            (0, 0, 1, 0, 2)
        );

        assert_eq!(
            worst_status(&p, "st", &["f1".into(), "f3".into()])
                .unwrap()
                .as_deref(),
            Some("done")
        );
        assert_eq!(
            worst_status(&p, "st", &["f4".into()]).unwrap().as_deref(),
            Some("quarantined"),
            "the only row is still the worst one"
        );
    }

    #[test]
    fn failed_tasks_newest_first() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            task(&conn, "st", "old", "failed", Some("e1"), Some(100));
            task(&conn, "st", "new", "failed", Some("e2"), Some(900));
            task(&conn, "st", "ok", "done", None, Some(500));
        }
        let failed = failed_tasks(&p, "st", 10).unwrap();
        // Only failed rows, newest finished_at first.
        assert_eq!(failed.len(), 2);
        assert_eq!(failed[0].subject_id, "new");
        assert_eq!(failed[0].title, "new"); // title defaults to the raw id
        assert_eq!(failed[0].error.as_deref(), Some("e2"));
        assert_eq!(failed[1].subject_id, "old");
    }
}
