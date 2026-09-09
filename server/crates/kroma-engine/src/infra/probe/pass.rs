//! Probing a whole library: the phase-2 background pass, its worker pool, and
//! the single-file write both it and the `pipeline.probe` stage go through.

use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use tracing::{info, warn};

use crate::db::{self, FileProbe, Pool};
use crate::infra::events::{Bus, ServerEvent};
use crate::services::activity::{self, Shared as Activity};

use super::probe_file;

// Half the cores, clamped to 2..4: each ffprobe is a real process, and more at
// once starves interactive work on a small NAS. `KROMA_PROBE_WORKERS` overrides.
fn probe_workers() -> usize {
    if let Some(n) = std::env::var("KROMA_PROBE_WORKERS")
        .ok()
        .and_then(|s| s.parse().ok())
    {
        return n;
    }
    let cores = std::thread::available_parallelism()
        .map(std::num::NonZeroUsize::get)
        .unwrap_or(4);
    (cores / 2).clamp(2, 4)
}

struct ProbeJob {
    file_id: String,
    abs_path: String,
    item_id: String,
}

/// ffprobe every file with `probed=0`, write the result, and emit live events so
/// clients fill in codec/HDR badges. Returns immediately; work runs on a small
/// pool of detached threads. A no-op when there are no unprobed files.
pub fn spawn_probe_pass(pool: Pool, ffprobe_present: bool, bus: Bus, activity: Activity) {
    let unprobed = match db::unprobed_files(&pool) {
        Ok(v) => v,
        Err(e) => {
            warn!(error = %e, "failed to list unprobed files; skipping probe pass");
            return;
        }
    };
    if unprobed.is_empty() {
        info!("phase-2 probe: nothing to probe (mtime cache hit)");
        return;
    }

    let total = unprobed.len();
    info!(files = total, "starting phase-2 background probing");
    activity::probe_started(&activity, total);

    let jobs: Vec<ProbeJob> = unprobed
        .into_iter()
        .map(|(file_id, abs_path, item_id)| ProbeJob {
            file_id,
            abs_path,
            item_id,
        })
        .collect();
    let queue = Arc::new(Mutex::new(jobs));
    let done = Arc::new(AtomicUsize::new(0));

    thread::spawn(move || run_probe_pass(pool, ffprobe_present, bus, activity, queue, done, total));
}

#[allow(clippy::too_many_arguments)]
fn run_probe_pass(
    pool: Pool,
    ffprobe_present: bool,
    bus: Bus,
    activity: Activity,
    queue: Arc<Mutex<Vec<ProbeJob>>>,
    done: Arc<AtomicUsize>,
    total: usize,
) {
    let worker_count = probe_workers().min(total.max(1));
    let mut handles = Vec::with_capacity(worker_count);
    for _ in 0..worker_count {
        let pool = pool.clone();
        let queue = queue.clone();
        let done = done.clone();
        let bus = bus.clone();
        let activity = activity.clone();
        handles.push(thread::spawn(move || {
            probe_worker_loop(
                &pool,
                ffprobe_present,
                &queue,
                &done,
                &bus,
                &activity,
                total,
            )
        }));
    }
    for h in handles {
        let _ = h.join();
    }
    let done = done.load(Ordering::Relaxed);
    activity::probe_completed(&activity);
    info!(probed = done, total, "phase-2 probing complete");
    bus.publish(ServerEvent::ProbeProgress { done, total });
    bus.publish(ServerEvent::ProbeCompleted { total });
    bus.publish(ServerEvent::LibraryUpdated);
}

#[allow(clippy::too_many_arguments)]
fn probe_worker_loop(
    pool: &Pool,
    ffprobe_present: bool,
    queue: &Arc<Mutex<Vec<ProbeJob>>>,
    done: &Arc<AtomicUsize>,
    bus: &Bus,
    activity: &Activity,
    total: usize,
) {
    loop {
        let job = match queue.lock().unwrap().pop() {
            Some(j) => j,
            None => break,
        };
        if let Err(e) = probe_one(
            pool,
            ffprobe_present,
            bus,
            &job.file_id,
            &job.abs_path,
            &job.item_id,
        ) {
            warn!(file = %job.file_id, error = %e, "failed to store probe result");
        }
        let n = done.fetch_add(1, Ordering::Relaxed) + 1;
        activity::probe_progress(activity, n);
        if n.is_multiple_of(25) {
            bus.publish(ServerEvent::ProbeProgress { done: n, total });
        }
    }
}

/// Store the stream columns (+ `probed=1`), derive intro/credits markers from any
/// embedded chapters, and emit `ItemUpdated` when this is the item's first probed
/// file. Shared by the background probe pass and the `pipeline.probe` stage.
pub fn probe_one(
    pool: &Pool,
    ffprobe: bool,
    bus: &Bus,
    file_id: &str,
    abs_path: &str,
    item_id: &str,
) -> anyhow::Result<()> {
    let first_for_item = db::item_has_probed_file(pool, item_id)
        .map(|has| !has)
        .unwrap_or(true);
    let result = probe_file(Path::new(abs_path), ffprobe);
    db::set_file_probe(
        pool,
        file_id,
        &FileProbe {
            duration_ms: result.duration_ms,
            video: result.video.as_ref(),
            audio: result.audio.as_ref(),
            audio_tracks: &result.audio_tracks,
            subtitles: &result.subtitles,
            unreadable: result.unreadable.as_deref(),
        },
    )?;
    for (kind, start, end) in super::markers_from_chapters(&result.chapters, result.duration_ms) {
        let _ = db::set_marker(pool, item_id, kind, start, end, "chapters");
    }
    if first_for_item {
        bus.publish(ServerEvent::ItemUpdated {
            id: item_id.to_string(),
        });
    }
    Ok(())
}
