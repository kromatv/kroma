//! Embedded TEXT subtitle → WebVTT extraction + disk cache.
//!
//! Extracting a text subtitle demuxes the whole container front-to-back,
//! which is slow over a network mount - especially while the HLS remux
//! competes for the same file. So this runs once per `(file, mtime, track)`
//! and caches the WebVTT under `<data>/subs/`, served instantly thereafter.
//! A single ffmpeg pass demuxes the file once and writes every requested
//! track, so N tracks cost one whole-file read, not N.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use crate::domain::media::SubtitleTrack;

/// Extraction wall-clock budget, scaled to the file: a text-subtitle demux is
/// bandwidth-bound (ffmpeg reads the container front-to-back), so budget the
/// size at a conservative 20 MB/s, clamped to 150s..7200s. A fixed, low
/// ceiling starves large files (a 4K remux can be 40-80 GB): the pass times
/// out, the partial output is discarded, and the next attempt restarts the
/// whole read from zero. The pass runs once per (file, mtime) and caches for
/// good, so a long ceiling costs one long night, not a slow server.
pub fn timeout_for(abs: &str) -> Duration {
    let size = std::fs::metadata(abs).map(|m| m.len()).unwrap_or(0);
    let secs = (size / (20 * 1024 * 1024)).clamp(150, 7200);
    Duration::from_secs(secs)
}

// Concurrent callers for the same file (a viewer's toggle racing the playback
// pre-warm or the pipeline stage) serialize here; the losers then find the
// cache already written and no-op instead of demuxing a second time in parallel.
fn file_lock(abs: &str) -> Arc<Mutex<()>> {
    static LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();
    let map = LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    map.lock()
        .unwrap()
        .entry(abs.to_string())
        .or_default()
        .clone()
}

/// Extract every still-missing text track of `abs`, serialized per file: the
/// pending set is computed UNDER the lock, so whichever caller ran first has
/// already filled the cache and later callers are a cheap stat + no-op. This is
/// the one entry point the endpoint, the playback pre-warm and the pipeline
/// stage all share. Blocking; run it on a blocking thread.
pub fn extract_pending_locked(
    data_dir: &Path,
    abs: &str,
    subs: &[SubtitleTrack],
    cancel: &dyn Fn() -> bool,
) -> Result<(), String> {
    // Offline mount / moved file: one stat instead of an ffmpeg spawn per caller.
    if !Path::new(abs).exists() {
        return Err("media file unavailable (mount offline?)".to_string());
    }
    let lock = file_lock(abs);
    let _guard = lock
        .lock()
        .map_err(|_| "subtitle extraction lock poisoned".to_string())?;
    let pending = pending_text_tracks(data_dir, abs, subs);
    extract_batch_blocking_cancellable(abs, &pending, cancel)
}

// Distinct temp suffixes so two concurrent extractions of the same file never
// clobber each other's `.part` output (the pid alone collides in-process).
static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// Whether a (normalized) subtitle codec can be converted to WebVTT. Image subs
/// (PGS/VobSub/DVD) are bitmap and cannot be rendered as text, so they are skipped.
/// Mirrors the clients' `isTextSubtitle` against `probe::normalize_codec` output.
pub fn is_text_codec(codec: &str) -> bool {
    matches!(
        codec,
        "subrip" | "srt" | "ass" | "ssa" | "mov_text" | "webvtt" | "vtt"
    )
}

/// `<data>/subs/<hash>.vtt`, keyed by file path + mtime + track index so a replaced
/// file re-extracts and each track caches independently.
pub fn cache_path(data_dir: &Path, abs: &str, index: usize) -> PathBuf {
    let mtime = std::fs::metadata(abs)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // `short_hash` (sha256) is STABLE across std/toolchain versions, unlike
    // `DefaultHasher` whose seed can shift and silently orphan every cached VTT.
    // Mirrors `infra::storyboard`'s `key()`.
    let key = kroma_primitives::short_hash(&format!("{abs}:{mtime}:{index}"));
    data_dir.join("subs").join(format!("{key}.vtt"))
}

/// The text tracks of `subs` not yet cached, as `(0:s:<index>, cache_path)` pairs.
/// Image subs and already-extracted tracks are dropped, so an empty result means
/// "nothing to do".
pub fn pending_text_tracks(
    data_dir: &Path,
    abs: &str,
    subs: &[SubtitleTrack],
) -> Vec<(usize, PathBuf)> {
    subs.iter()
        .enumerate()
        .filter(|(_, s)| is_text_codec(&s.codec))
        .map(|(i, _)| (i, cache_path(data_dir, abs, i)))
        .filter(|(_, path)| !path.exists())
        .collect()
}

/// Delete every cached WebVTT for `abs`'s text tracks so a reprocess rebuilds them
/// from scratch (mirrors `storyboard::invalidate`). Best-effort.
pub fn invalidate(data_dir: &Path, abs: &str, subs: &[SubtitleTrack]) {
    for (i, s) in subs.iter().enumerate() {
        if is_text_codec(&s.codec) {
            let _ = std::fs::remove_file(cache_path(data_dir, abs, i));
        }
    }
}

// Each requested text track is extracted to its cache file in one ffmpeg
// pass (the file is demuxed once for all `tracks`). Each output goes to a
// temp sibling (scoped by pid + a per-call sequence, so two concurrent
// extractions of the same file never collide) and is atomically renamed on
// success. Blocking; bounded by `timeout_for`; aborts the in-flight ffmpeg
// the moment `cancel` flips.
fn extract_batch_blocking_cancellable(
    abs: &str,
    tracks: &[(usize, PathBuf)],
    cancel: &dyn Fn() -> bool,
) -> Result<(), String> {
    if tracks.is_empty() {
        return Ok(());
    }
    if let Some(dir) = tracks[0].1.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("could not create the subtitle cache dir: {e}"))?;
    }
    let pid = std::process::id();
    let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let tmps: Vec<PathBuf> = tracks
        .iter()
        .map(|(_, out)| out.with_extension(format!("{pid}.{seq}.part")))
        .collect();

    let mut cmd = Command::new("ffmpeg");
    // Text-subtitle decode is trivial; the cost is the demux read. One thread
    // keeps this from competing with a live remux for cores.
    cmd.args(["-v", "error", "-nostdin", "-threads", "1", "-y", "-i"])
        .arg(abs);
    for ((sidx, _), tmp) in tracks.iter().zip(&tmps) {
        cmd.arg("-map")
            .arg(format!("0:s:{sidx}"))
            .args(["-f", "webvtt"])
            .arg(tmp);
    }

    let outcome =
        crate::infra::ffmpeg_run::run_capturing_cancellable(cmd, timeout_for(abs), cancel);

    // Move each non-empty output into place; clean up the rest either way so a
    // failed/partial pass never leaves temp files behind.
    let mut moved = 0usize;
    for ((_, out), tmp) in tracks.iter().zip(&tmps) {
        let ok = outcome.is_ok()
            && std::fs::metadata(tmp).map(|m| m.len() > 0).unwrap_or(false)
            && std::fs::rename(tmp, out).is_ok();
        if ok {
            moved += 1;
        } else {
            let _ = std::fs::remove_file(tmp);
        }
    }
    match outcome {
        Ok(()) if moved > 0 => Ok(()),
        // ffmpeg succeeded but produced nothing usable (e.g. every mapped track was
        // empty): not a hard error, just nothing to cache.
        Ok(()) => Ok(()),
        Err(reason) => Err(reason),
    }
}
