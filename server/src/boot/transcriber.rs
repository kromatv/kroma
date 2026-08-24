//! Whichever sidecar answers the `transcriber` point, as the subtitle service's
//! transcription step. Transcription is long-running, so progress and
//! cancellation ride a shared DB row rather than the buffered HTTP call.
//!
//! Nothing here implements a trait the engine declared: the engine takes a
//! closure, and [`TranscriberClient::step`] is what the composition root hands
//! it. A module answers JSON and knows nothing about this file.

/// Talks to that sidecar over the point bridge instead of transcribing
/// in-process, so a heavy model and its Metal/CUDA deps run out of the core.
/// Transcription is long and drives live progress + mid-run cancel, which don't
/// fit `kroma-http`'s buffered request/response, so a shared `whisper_jobs` DB
/// row is the side-channel: the HTTP call blocks on a helper thread while THIS
/// thread polls the row to drive the (thread-bound) `on_stage`/`on_progress`
/// callbacks and writes the cancel flag.
use kroma_engine::services::subtitles::TranscribeJob;

pub struct TranscriberClient {
    resolve: kroma_module_host::Resolver,
    pool: kroma_db::Pool,
}

impl TranscriberClient {
    pub fn new(resolve: kroma_module_host::Resolver, pool: kroma_db::Pool) -> Self {
        Self { resolve, pool }
    }

    /// Whether a transcriber is currently running (the point resolves).
    pub fn available(&self) -> bool {
        (self.resolve)().is_some()
    }
}

impl TranscriberClient {
    /// The transcription step, in the shape `subtitles::generate` takes.
    pub fn step(&self) -> impl Fn(TranscribeJob<'_>) -> Option<String> + '_ {
        move |job| self.run(job)
    }

    fn run(&self, job: TranscribeJob<'_>) -> Option<String> {
        let TranscribeJob {
            data_dir,
            model_spec,
            input,
            track,
            lang,
            on_stage,
            on_progress,
            cancel,
        } = job;
        use std::sync::mpsc::TryRecvError;
        use std::time::Duration;

        let (base, token) = (self.resolve)()?;
        // A per-run coordination row; nanosecond clock + track avoids collisions
        // across concurrent generations.
        let job_id = format!(
            "wj-{}-{track}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        if let Ok(conn) = self.pool.get() {
            let _ = conn.execute(
                "INSERT OR REPLACE INTO whisper_jobs (id, stage, done, total, cancel) VALUES (?1,'',0,0,0)",
                [&job_id],
            );
        }

        // The blocking HTTP call (minutes) runs on a helper thread; its result
        // returns over the channel so THIS thread can poll progress meanwhile.
        let (tx, rx) = std::sync::mpsc::channel();
        {
            let body = serde_json::json!({
                "job_id": job_id,
                "data_dir": data_dir.to_string_lossy(),
                "model_spec": model_spec,
                "input": input.to_string_lossy(),
                "track": track,
                "lang": lang,
            });
            std::thread::spawn(move || {
                let text: Option<String> = kroma_http::Fetch::new()
                    .header("authorization", format!("Bearer {token}"))
                    .max_time(3 * 60 * 60)
                    .post_json(&format!("{base}/_port/transcriber/transcribe"), &body)
                    .and_then(|r| r.ensure_ok())
                    .and_then(|r| r.json::<Option<String>>())
                    .ok()
                    .flatten();
                let _ = tx.send(text);
            });
        }

        let mut last_stage = String::new();
        let result = loop {
            match rx.try_recv() {
                Ok(text) => break text,
                Err(TryRecvError::Disconnected) => break None,
                Err(TryRecvError::Empty) => {}
            }
            // One pooled connection per tick: push the cancel flag (if latched)
            // then read progress off the same row.
            pump_progress(
                &self.pool,
                &job_id,
                cancel,
                on_stage,
                on_progress,
                &mut last_stage,
            );
            std::thread::sleep(Duration::from_millis(250));
        };

        if let Ok(conn) = self.pool.get() {
            let _ = conn.execute("DELETE FROM whisper_jobs WHERE id = ?1", [&job_id]);
        }
        result
    }
}

// Best-effort: a connection/query failure just skips this tick.
fn pump_progress(
    pool: &kroma_db::Pool,
    job_id: &str,
    cancel: &std::sync::atomic::AtomicBool,
    on_stage: &dyn Fn(&str),
    on_progress: &dyn Fn(usize, usize),
    last_stage: &mut String,
) {
    use std::sync::atomic::Ordering;
    let Ok(conn) = pool.get() else { return };
    if cancel.load(Ordering::Relaxed) {
        let _ = conn.execute("UPDATE whisper_jobs SET cancel = 1 WHERE id = ?1", [job_id]);
    }
    if let Ok((stage, done, total)) = conn.query_row(
        "SELECT stage, done, total FROM whisper_jobs WHERE id = ?1",
        [job_id],
        |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, i64>(2)?,
            ))
        },
    ) {
        if !stage.is_empty() && stage != *last_stage {
            on_stage(&stage);
            *last_stage = stage;
        }
        if total > 0 {
            on_progress(done as usize, total as usize);
        }
    }
}
