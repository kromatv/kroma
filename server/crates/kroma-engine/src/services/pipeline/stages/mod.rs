//! The concrete pipeline stages: each owns a `Stage` descriptor plus its
//! `enumerate`/`process`, wrapping the existing processing code (ffmpeg,
//! chromaprint) so only iteration/skip/retry moves onto the ledger.

mod common;

pub mod embed;
pub mod loudness;
pub mod markers;
pub mod metadata;
pub mod probe;
pub mod storyboard;
pub mod subtitles;

/// A cheap change-signature for a file: `mtime:size`. Changes when the file is
/// replaced, so the ledger re-queues that subject. Returns
/// [`crate::db::pipeline::UNREADABLE_SIG`] when the file can't be stat'd (e.g. the
/// media mount is briefly offline), which `reconcile` treats as "leave the task
/// alone" rather than a changed input, so a flapping mount does not re-queue the
/// whole library.
pub(crate) fn sig_for_path(abs: &str) -> String {
    match std::fs::metadata(abs) {
        Ok(m) => {
            let mtime = m
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            format!("{mtime}:{}", m.len())
        }
        Err(_) => crate::db::pipeline::UNREADABLE_SIG.to_string(),
    }
}
