//! One continuous ffmpeg per (item, audio-mode), writing fMP4 segments served as
//! it produces them. Per-segment `-ss … -c:v copy -t <dur>` cuts are unreliable on
//! MKV (the cue index is only a keyframe subset, so the copy over-runs and desyncs
//! A/V); one process splits at real keyframes and owns the playlist. A seek the
//! client cannot reach re-anchors by reloading the master at `?t=<secs>`.
//!
//! This half starts sessions and serves out of them; [`super::reclaim`] is what
//! takes them away again.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::process::Child;
use tokio::sync::Mutex;
use tokio::time::sleep;
use tracing::{info, warn};

use super::ffmpeg::{detect_burst, keyframe_before, spawn_stream};
use super::naming::{contains, content_type, is_safe_name, seg_index, session_dir};
use super::StreamMode;

const FILE_WAIT: Duration = Duration::from_secs(20);
// History kept behind the SLOWEST reader of a session (see `prune_cutoff`), so
// it bounds a backward seek rather than a buffer depth.
pub(super) const KEEP_BEHIND_SEGS: u64 = 45;

pub(super) struct Session {
    pub(super) dir: PathBuf,
    pub(super) child: Mutex<Child>,
    pub(super) last_access: Mutex<Instant>,
    // Lowest segment asked for since the last reap, i.e. the trailing edge of
    // what someone is actually reading. `u64::MAX` = nothing asked for yet.
    low_seg: AtomicU64,
    pruned: AtomicU64,
    // Real stream start (s): the keyframe at-or-before the requested anchor,
    // which the client uses as `baseSec`.
    start: f64,
}

impl Session {
    async fn touch(&self) {
        *self.last_access.lock().await = Instant::now();
    }

    async fn finished(&self) -> bool {
        matches!(self.child.lock().await.try_wait(), Ok(Some(_)))
    }

    /// Folds a request into the retention floor. `false` when the segment is
    /// already pruned, in which case the floor is left alone: an index from
    /// behind the prune mark would underflow the cutoff, hold the whole window
    /// open, and keep the session too fresh for anything to reclaim it.
    fn note_request(&self, idx: u64) -> bool {
        if self.is_pruned(idx) {
            return false;
        }
        self.low_seg.fetch_min(idx, Ordering::Relaxed);
        true
    }

    fn is_pruned(&self, idx: u64) -> bool {
        idx < self.pruned.load(Ordering::Relaxed)
    }

    /// How far the retention window may advance, or `None` to keep everything.
    ///
    /// Measured from the LOWEST index requested since the last reap, not the
    /// highest. A player that prefetches far ahead, and a second viewer further
    /// back on the same key, both used to drag the cutoff past the trailing
    /// reader and 404 the segments it was about to play.
    ///
    /// Taking the floor also resets it: a session nobody read this round keeps
    /// everything it has rather than pruning against a stale mark.
    pub(super) fn prune_cutoff(&self) -> Option<u64> {
        let floor = self.low_seg.swap(u64::MAX, Ordering::Relaxed);
        if floor == u64::MAX {
            return None;
        }
        let cutoff = floor.checked_sub(KEEP_BEHIND_SEGS).filter(|c| *c > 0)?;
        self.pruned.fetch_max(cutoff, Ordering::Relaxed);
        Some(cutoff)
    }
}

/// Remux sessions keyed per program + anchor (see `session_key`).
pub struct Sessions {
    pub(super) root: PathBuf,
    pub(super) cap: usize,
    // On-disk byte budget for the whole cache; 0 = unlimited.
    pub(super) budget: AtomicU64,
    burst: bool,
    pub(super) inner: Mutex<HashMap<String, Arc<Session>>>,
}

impl Sessions {
    pub fn new(data_dir: &Path, cap: usize, budget: u64) -> Self {
        let root = data_dir.join("hls");
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::create_dir_all(&root);
        Sessions {
            root,
            cap: cap.max(1),
            budget: AtomicU64::new(budget),
            burst: detect_burst(),
            inner: Mutex::new(HashMap::new()),
        }
    }

    /// Retune the disk budget at runtime; 0 = unlimited.
    pub fn set_budget(&self, bytes: u64) {
        self.budget.store(bytes, Ordering::Relaxed);
    }

    pub fn bytes(&self) -> u64 {
        super::reclaim::dir_bytes(&self.root)
    }

    /// Returns the media playlist bytes plus the real stream start (s) for `baseSec`.
    pub async fn master(
        &self,
        key: &str,
        input: &Path,
        audio: u32,
        mode: StreamMode,
        start_secs: f64,
    ) -> Option<(Vec<u8>, f64)> {
        let session = match self.ensure(key, input, audio, mode, start_secs).await {
            Ok(s) => s,
            Err(e) => {
                warn!(error = %e, session = %key, "failed to start HLS remux");
                return None;
            }
        };
        let start = session.start;
        let path = session.dir.join("index.m3u8");
        let deadline = Instant::now() + FILE_WAIT;
        loop {
            if let Ok(bytes) = tokio::fs::read(&path).await {
                // A media playlist is only valid once it carries a target duration.
                if contains(&bytes, b"#EXT-X-TARGETDURATION") {
                    return Some((bytes, start));
                }
            }
            if Instant::now() >= deadline {
                return tokio::fs::read(&path).await.ok().map(|b| (b, start));
            }
            sleep(Duration::from_millis(80)).await;
        }
    }

    /// A finished playlist gains `#EXT-X-ENDLIST` so it becomes seekable VOD; a
    /// not-yet-produced segment is polled for until ffmpeg flushes it.
    pub async fn file(&self, key: &str, name: &str) -> Option<(Vec<u8>, &'static str)> {
        if !is_safe_name(name) {
            return None;
        }
        let session = { self.inner.lock().await.get(key).cloned() }?;
        session.touch().await;
        let idx = seg_index(name);
        // A pruned segment is never reproduced (the remux only moves forward), so
        // 404 now instead of burning FILE_WAIT on a poll that cannot succeed.
        if idx.is_some_and(|i| !session.note_request(i)) {
            return None;
        }
        let path = session.dir.join(name);
        let deadline = Instant::now() + FILE_WAIT;
        loop {
            if let Ok(mut bytes) = tokio::fs::read(&path).await {
                if name.ends_with(".m3u8")
                    && session.finished().await
                    && !contains(&bytes, b"#EXT-X-ENDLIST")
                {
                    bytes.extend_from_slice(b"#EXT-X-ENDLIST\n");
                }
                return Some((bytes, content_type(name)));
            }
            // A reap during the wait can delete what this poll is waiting for.
            if idx.is_some_and(|i| session.is_pruned(i)) {
                return None;
            }
            if Instant::now() >= deadline {
                return None;
            }
            sleep(Duration::from_millis(80)).await;
        }
    }

    async fn ensure(
        &self,
        key: &str,
        input: &Path,
        audio: u32,
        mode: StreamMode,
        start_secs: f64,
    ) -> std::io::Result<Arc<Session>> {
        // The anchor is part of the key, so an existing session is always the right one.
        {
            let map = self.inner.lock().await;
            if let Some(s) = map.get(key) {
                s.touch().await;
                return Ok(s.clone());
            }
        }
        // Shells out to ffprobe: must not run under the lock.
        let start = keyframe_before(input, start_secs).await;

        let mut map = self.inner.lock().await;
        if let Some(s) = map.get(key) {
            s.touch().await; // another task created it while we probed
            return Ok(s.clone());
        }
        self.reap_superseded(&mut map, key).await;
        self.make_room(&mut map, key).await;
        let dir = self.root.join(session_dir(key));
        super::reclaim::discard_dir(&dir);
        std::fs::create_dir_all(&dir)?;
        let child = spawn_stream(input, &dir, audio, mode, start_secs, self.burst)?;
        info!(session = %key, audio, mode = ?mode, anchor = start_secs, start, "started HLS remux");
        let session = Arc::new(Session {
            dir,
            child: Mutex::new(child),
            last_access: Mutex::new(Instant::now()),
            low_seg: AtomicU64::new(u64::MAX),
            pruned: AtomicU64::new(0),
            start,
        });
        map.insert(key.to_string(), session.clone());
        Ok(session)
    }
}

#[cfg(test)]
pub(super) mod testing;

#[cfg(test)]
mod tests {
    use super::testing::{fake_session, LIVE};
    use super::*;

    fn probe(low: Option<u64>) -> Arc<Session> {
        let s = fake_session(PathBuf::from("/nonexistent"), LIVE);
        if let Some(idx) = low {
            s.note_request(idx);
        }
        s
    }

    #[tokio::test]
    async fn a_session_nobody_read_this_round_keeps_everything() {
        assert_eq!(probe(None).prune_cutoff(), None);
    }

    #[tokio::test]
    async fn the_window_is_kept_behind_the_trailing_reader() {
        let s = probe(Some(KEEP_BEHIND_SEGS + 10));
        assert_eq!(s.prune_cutoff(), Some(10));
        assert!(s.is_pruned(9));
        assert!(!s.is_pruned(10));
    }

    #[tokio::test]
    async fn a_prefetch_far_ahead_does_not_prune_what_the_reader_still_needs() {
        let s = probe(Some(5));
        s.note_request(5_000); // the same client buffering minutes ahead
        assert_eq!(s.prune_cutoff(), None);
        assert!(!s.is_pruned(0));
    }

    // Two viewers share a session key: the one further ahead must not evict the
    // segments the one behind is about to play.
    #[tokio::test]
    async fn a_reader_further_ahead_does_not_prune_a_reader_behind_it() {
        let s = probe(Some(KEEP_BEHIND_SEGS + 2));
        s.note_request(KEEP_BEHIND_SEGS * 4);
        assert_eq!(s.prune_cutoff(), Some(2));
        assert!(!s.is_pruned(2));
    }

    #[tokio::test]
    async fn a_request_for_a_pruned_segment_does_not_reopen_the_window() {
        let s = probe(Some(KEEP_BEHIND_SEGS + 100));
        assert_eq!(s.prune_cutoff(), Some(100));

        // A backward seek to something the playlist still lists but the reaper
        // has already deleted: it 404s, and must not become the new floor.
        assert!(!s.note_request(5));
        assert_eq!(s.prune_cutoff(), None);

        s.note_request(KEEP_BEHIND_SEGS + 200);
        assert_eq!(
            s.prune_cutoff(),
            Some(200),
            "a servable request still advances it"
        );
    }

    #[tokio::test]
    async fn the_floor_resets_each_round_so_a_seek_back_is_not_pruned() {
        let s = probe(Some(KEEP_BEHIND_SEGS + 100));
        assert_eq!(s.prune_cutoff(), Some(100));
        s.note_request(KEEP_BEHIND_SEGS + 120);
        // A later round never un-prunes, but it also never prunes past its own floor.
        assert_eq!(s.prune_cutoff(), Some(120));
        assert!(s.is_pruned(119));
    }
}
