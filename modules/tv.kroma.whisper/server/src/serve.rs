//! The provider side of Whisper transcription. Live progress and mid-run cancel
//! do not fit `kroma-http`'s buffered request/response, so a shared `whisper_jobs`
//! row is the channel: this module writes stage/done/total and reads the cancel
//! flag, the calling core does the reverse.

use std::cell::Cell;
use std::time::{Duration, Instant};

use axum::routing::post;
use axum::{Json, Router};
use kroma_module_sdk::db::Pool;
use kroma_module_sdk::host::{run_blocking, HostStorage};
use serde::Deserialize;

const CANCEL_POLL: Duration = Duration::from_millis(300);

pub fn whisper_routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route("/_port/transcriber/transcribe", post(transcribe_h::<S>))
}

#[derive(Deserialize)]
struct TranscribeReq {
    job_id: String,
    data_dir: String,
    model_spec: String,
    input: String,
    track: u32,
    lang: Option<String>,
}

async fn transcribe_h<S: HostStorage + Clone + Send + Sync + 'static>(
    axum::extract::State(host): axum::extract::State<S>,
    Json(req): Json<TranscribeReq>,
) -> Json<Option<String>> {
    let pool = host.db().clone();
    let text = run_blocking(move || run(&pool, &req)).await.ok().flatten();
    Json(text)
}

struct CancelFlag<'a> {
    pool: &'a Pool,
    job_id: &'a str,
    asked: Cell<Option<Instant>>,
    raised: Cell<bool>,
}

impl<'a> CancelFlag<'a> {
    fn of(pool: &'a Pool, job_id: &'a str) -> Self {
        Self {
            pool,
            job_id,
            asked: Cell::new(None),
            raised: Cell::new(false),
        }
    }

    fn is_raised(&self) -> bool {
        if self.raised.get() {
            return true;
        }
        if self.asked.get().is_some_and(|at| at.elapsed() < CANCEL_POLL) {
            return false;
        }
        self.asked.set(Some(Instant::now()));
        let raised = self.pool.get().is_ok_and(|conn| {
            conn.query_row(
                "SELECT cancel FROM whisper_jobs WHERE id = ?1",
                [self.job_id],
                |row| row.get::<_, i64>(0),
            )
            .is_ok_and(|cancel| cancel != 0)
        });
        self.raised.set(raised);
        raised
    }
}

fn run(pool: &Pool, req: &TranscribeReq) -> Option<String> {
    let flag = CancelFlag::of(pool, &req.job_id);
    let on_stage = |stage: &str| {
        if let Ok(conn) = pool.get() {
            let _ = conn.execute(
                "UPDATE whisper_jobs SET stage = ?2, done = 0, total = 0 WHERE id = ?1",
                (&req.job_id, stage),
            );
        }
    };
    let on_progress = |done: usize, total: usize| {
        if let Ok(conn) = pool.get() {
            let _ = conn.execute(
                "UPDATE whisper_jobs SET done = ?2, total = ?3 WHERE id = ?1",
                (&req.job_id, done as i64, total as i64),
            );
        }
    };

    crate::transcribe(
        std::path::Path::new(&req.data_dir),
        &req.model_spec,
        std::path::Path::new(&req.input),
        req.track,
        req.lang.as_deref(),
        &on_stage,
        &on_progress,
        &|| flag.is_raised(),
    )
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::db;

    use super::*;

    const JOB: &str = "wj-1";

    fn pool_with_a_job() -> db::testing::TempPool {
        let pool = db::testing::temp_pool("whisper-serve");
        pool.get()
            .unwrap()
            .execute(
                "INSERT INTO whisper_jobs (id, stage, done, total, cancel) VALUES (?1,'',0,0,0)",
                [JOB],
            )
            .unwrap();
        pool
    }

    fn raise_the_flag(pool: &Pool) {
        pool.get()
            .unwrap()
            .execute("UPDATE whisper_jobs SET cancel = 1 WHERE id = ?1", [JOB])
            .unwrap();
    }

    #[test]
    fn a_flag_nobody_raised_reads_as_not_cancelled() {
        let pool = pool_with_a_job();

        let flag = CancelFlag::of(&pool, JOB);

        assert!(!flag.is_raised());
    }

    #[test]
    fn a_job_with_no_row_reads_as_not_cancelled() {
        let pool = db::testing::temp_pool("whisper-serve");

        let flag = CancelFlag::of(&pool, JOB);

        assert!(!flag.is_raised());
    }

    #[test]
    fn a_raised_flag_is_read_on_the_first_look() {
        let pool = pool_with_a_job();
        raise_the_flag(&pool);

        let flag = CancelFlag::of(&pool, JOB);

        assert!(flag.is_raised());
    }

    #[test]
    fn the_row_is_read_once_per_poll_however_often_the_flag_is_asked() {
        let pool = pool_with_a_job();
        let flag = CancelFlag::of(&pool, JOB);
        assert!(!flag.is_raised());

        raise_the_flag(&pool);
        let within_the_poll = flag.is_raised();
        std::thread::sleep(CANCEL_POLL + Duration::from_millis(20));
        let after_the_poll = flag.is_raised();

        assert!(!within_the_poll);
        assert!(after_the_poll);
    }

    #[test]
    fn a_raised_flag_stays_raised_when_the_row_goes_away() {
        let pool = pool_with_a_job();
        raise_the_flag(&pool);
        let flag = CancelFlag::of(&pool, JOB);
        assert!(flag.is_raised());

        pool.get()
            .unwrap()
            .execute("DELETE FROM whisper_jobs WHERE id = ?1", [JOB])
            .unwrap();
        std::thread::sleep(CANCEL_POLL + Duration::from_millis(20));

        assert!(flag.is_raised());
    }

    #[cfg(feature = "local")]
    #[test]
    fn a_job_reports_the_stage_it_stopped_at_on_its_row() {
        let pool = pool_with_a_job();
        let data = kroma_module_sdk::testing::temp_dir("whisper-serve-data");
        let req = TranscribeReq {
            job_id: JOB.to_string(),
            data_dir: data.path().to_string_lossy().into_owned(),
            model_spec: "someone/else-model".to_string(),
            input: "/nowhere.mkv".to_string(),
            track: 0,
            lang: None,
        };

        let text = run(&pool, &req);

        let stage: String = pool
            .get()
            .unwrap()
            .query_row("SELECT stage FROM whisper_jobs WHERE id = ?1", [JOB], |r| r.get(0))
            .unwrap();
        assert_eq!(text, None);
        assert_eq!(stage, "model");
    }
}
