//! The WebVTT cache under `<data>/subs/`, over
//! [`kroma_media::subtitles`]'s extraction pass.
//!
//! Extracting a text subtitle demuxes the whole container front-to-back, which
//! is slow over a network mount and slower while the HLS remux competes for the
//! same file. So it runs once per `(file, mtime, track)` and is served off disk
//! thereafter.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use kroma_media::subtitles::{extract_vtt, is_text_codec, timeout_for};

use crate::domain::media::SubtitleTrack;

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
    extract_vtt(abs, &pending, timeout_for(abs), cancel).map(drop)
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
/// from scratch. Best-effort.
pub fn invalidate(data_dir: &Path, abs: &str, subs: &[SubtitleTrack]) {
    for (i, s) in subs.iter().enumerate() {
        if is_text_codec(&s.codec) {
            let _ = std::fs::remove_file(cache_path(data_dir, abs, i));
        }
    }
}
