use super::*;
use crate::testing::TempPool;

fn pool() -> TempPool {
    crate::testing::temp_pool("jobs")
}

#[test]
fn a_write_against_a_held_lock_is_busy() {
    let p = pool();
    let holder = p.get().unwrap();
    holder.execute_batch("BEGIN IMMEDIATE").unwrap();
    let other = p.get().unwrap();
    other.busy_timeout(std::time::Duration::ZERO).unwrap();

    let err = other
        .execute("DELETE FROM job_runs", [])
        .map_err(anyhow::Error::from)
        .unwrap_err();

    assert!(is_busy(&err));
}

#[test]
fn a_missing_table_is_not_busy() {
    let p = pool();

    let err = p
        .get()
        .unwrap()
        .execute("DELETE FROM no_such_table", [])
        .map_err(anyhow::Error::from)
        .unwrap_err();

    assert!(!is_busy(&err));
}

#[test]
fn reconcile_flips_only_running_to_failed() {
    let p = pool();
    insert_job_run(&p, "r1", "cache.cleanup", "manual", 1).unwrap();
    insert_job_run(&p, "r2", "cache.cleanup", "manual", 1).unwrap();
    let r2 = RunStart {
        id: "r2",
        key: "cache.cleanup",
        trigger: "manual",
        started_ms: 1,
    };
    finish_job_run(&p, &r2, "success", 2, None).unwrap();

    let n = reconcile_running_runs(&p).unwrap();
    assert_eq!(n, 1);

    let r1 = last_one(&p, "r1");
    assert_eq!(r1.status, "failed");
    assert!(r1.finished_at.is_some());
    assert!(r1.error.unwrap().contains("restart"));
    assert_eq!(last_one(&p, "r2").status, "success");
}

#[test]
fn the_last_run_is_the_newest_and_a_job_that_never_ran_has_none() {
    let p = pool();
    insert_job_run(&p, "r1", "library.scan", "manual", 10).unwrap();
    insert_job_run(&p, "r2", "library.scan", "schedule", 20).unwrap();
    assert_eq!(last_job_run(&p, "library.scan").unwrap().unwrap().id, "r2");
    assert!(last_job_run(&p, "library.never-ran").unwrap().is_none());
}

#[test]
fn job_logs_keep_the_newest_window_but_read_oldest_first() {
    let p = pool();
    insert_job_run(&p, "r1", "library.scan", "manual", 1).unwrap();
    for (ts, message) in [(1, "started"), (2, "halfway"), (3, "done")] {
        insert_job_log(&p, "r1", ts, "info", message).unwrap();
    }

    let messages = |limit| {
        list_job_logs(&p, "r1", limit)
            .unwrap()
            .into_iter()
            .map(|l| l.message)
            .collect::<Vec<_>>()
    };
    assert_eq!(messages(10), ["started", "halfway", "done"]);
    assert_eq!(
        messages(2),
        ["halfway", "done"],
        "a limit drops the OLDEST lines"
    );
    assert_eq!(list_job_logs(&p, "r1", 1).unwrap()[0].level, "info");
    assert!(list_job_logs(&p, "another-run", 10).unwrap().is_empty());
}

fn last_one(p: &Pool, id: &str) -> JobRun {
    let conn = p.get().unwrap();
    conn.query_row(
        &format!("SELECT {RUN_COLS} FROM job_runs WHERE id=?1"),
        params![id],
        row_to_run,
    )
    .unwrap()
}

fn busy() -> anyhow::Error {
    rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_BUSY), None)
        .into()
}

#[test]
fn a_busy_write_is_tried_again_until_it_lands() {
    let mut attempts = 0;

    let result = retry_busy(&[0, 0, 0], || {
        attempts += 1;
        if attempts < 3 {
            Err(busy())
        } else {
            Ok(attempts)
        }
    });

    assert_eq!(result.unwrap(), 3);
}

#[test]
fn a_write_still_busy_after_every_delay_returns_its_error() {
    let mut attempts = 0;

    let result: anyhow::Result<()> = retry_busy(&[0, 0], || {
        attempts += 1;
        Err(busy())
    });

    assert!(is_busy(&result.unwrap_err()));
    assert_eq!(attempts, 3);
}

#[test]
fn any_other_failure_is_returned_at_once() {
    let mut attempts = 0;

    let result: anyhow::Result<()> = retry_busy(&[0, 0], || {
        attempts += 1;
        Err(anyhow::anyhow!("disk full"))
    });

    assert!(result.is_err());
    assert_eq!(attempts, 1);
}
