//! The out-of-process provider side of Whisper transcription. Live progress and
//! mid-run cancel do not fit `kroma-http`'s buffered request/response, so a
//! shared `whisper_jobs` row is the channel: this sidecar writes stage/done/total
//! and reads the cancel flag, the calling core does the reverse.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use axum::routing::post;
use axum::{Json, Router};
use kroma_module_sdk::db::Pool;
use kroma_module_sdk::host::HostStorage;
use serde::Deserialize;

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
    let text = tokio::task::spawn_blocking(move || run(pool, req))
        .await
        .ok()
        .flatten();
    Json(text)
}

fn run(pool: Pool, req: TranscribeReq) -> Option<String> {
    let cancel = Arc::new(AtomicBool::new(false));
    let finished = Arc::new(AtomicBool::new(false));

    {
        let (pool, cancel, finished, id) = (
            pool.clone(),
            cancel.clone(),
            finished.clone(),
            req.job_id.clone(),
        );
        std::thread::spawn(move || {
            while !finished.load(Ordering::Relaxed) {
                if let Ok(conn) = pool.get() {
                    let c: i64 = conn
                        .query_row(
                            "SELECT cancel FROM whisper_jobs WHERE id = ?1",
                            [&id],
                            |r| r.get(0),
                        )
                        .unwrap_or(0);
                    if c != 0 {
                        cancel.store(true, Ordering::Relaxed);
                    }
                }
                std::thread::sleep(Duration::from_millis(300));
            }
        });
    }

    let stage_pool = pool.clone();
    let stage_id = req.job_id.clone();
    let on_stage = move |stage: &str| {
        if let Ok(conn) = stage_pool.get() {
            let _ = conn.execute(
                "UPDATE whisper_jobs SET stage = ?2, done = 0, total = 0 WHERE id = ?1",
                (&stage_id, stage),
            );
        }
    };
    let prog_pool = pool.clone();
    let prog_id = req.job_id.clone();
    let on_progress = move |done: usize, total: usize| {
        if let Ok(conn) = prog_pool.get() {
            let _ = conn.execute(
                "UPDATE whisper_jobs SET done = ?2, total = ?3 WHERE id = ?1",
                (&prog_id, done as i64, total as i64),
            );
        }
    };

    let text = crate::transcribe(
        std::path::Path::new(&req.data_dir),
        &req.model_spec,
        std::path::Path::new(&req.input),
        req.track,
        req.lang.as_deref(),
        &on_stage,
        &on_progress,
        &cancel,
    );
    finished.store(true, Ordering::Relaxed);
    text
}
