//! How much of a session's output is kept behind the people reading it.
//!
//! A remux only moves forward, so a segment deleted is a segment gone: the
//! window has to be measured from the SLOWEST reader, not the furthest ahead. A
//! player that prefetches minutes of buffer, and a second viewer further back on
//! the same key, both used to drag the cutoff past the trailing reader and 404
//! the segments it was about to play.

use std::sync::atomic::{AtomicU64, Ordering};

// History kept behind the slowest reader, so it bounds a backward seek rather
// than a buffer depth.
pub(super) const KEEP_BEHIND_SEGS: u64 = 45;

pub(super) struct Window {
    // Lowest segment asked for since the last reap, i.e. the trailing edge of
    // what someone is actually reading. `u64::MAX` = nothing asked for yet.
    low: AtomicU64,
    pruned: AtomicU64,
}

impl Window {
    pub(super) const fn new() -> Self {
        Window {
            low: AtomicU64::new(u64::MAX),
            pruned: AtomicU64::new(0),
        }
    }

    /// Folds a request into the retention floor. `false` when the segment is
    /// already pruned, in which case the floor is left alone: an index from
    /// behind the prune mark would underflow the cutoff, hold the whole window
    /// open, and keep the session too fresh for anything to reclaim it.
    pub(super) fn note(&self, idx: u64) -> bool {
        if self.is_pruned(idx) {
            return false;
        }
        self.low.fetch_min(idx, Ordering::Relaxed);
        true
    }

    pub(super) fn is_pruned(&self, idx: u64) -> bool {
        idx < self.pruned.load(Ordering::Relaxed)
    }

    /// How far the retention window may advance, or `None` to keep everything.
    ///
    /// Taking the floor also resets it: a session nobody read this round keeps
    /// everything it has rather than pruning against a stale mark.
    pub(super) fn cutoff(&self) -> Option<u64> {
        let floor = self.low.swap(u64::MAX, Ordering::Relaxed);
        if floor == u64::MAX {
            return None;
        }
        let cutoff = floor.checked_sub(KEEP_BEHIND_SEGS).filter(|c| *c > 0)?;
        self.pruned.fetch_max(cutoff, Ordering::Relaxed);
        Some(cutoff)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window(low: Option<u64>) -> Window {
        let w = Window::new();
        if let Some(idx) = low {
            w.note(idx);
        }
        w
    }

    #[test]
    fn a_session_nobody_read_this_round_keeps_everything() {
        assert_eq!(window(None).cutoff(), None);
    }

    #[test]
    fn the_window_is_kept_behind_the_trailing_reader() {
        let w = window(Some(KEEP_BEHIND_SEGS + 10));

        assert_eq!(w.cutoff(), Some(10));
        assert!(w.is_pruned(9));
        assert!(!w.is_pruned(10));
    }

    #[test]
    fn a_prefetch_far_ahead_does_not_prune_what_the_reader_still_needs() {
        let w = window(Some(5));
        w.note(5_000);

        assert_eq!(w.cutoff(), None);
        assert!(!w.is_pruned(0));
    }

    // Two viewers share a session key: the one further ahead must not evict the
    // segments the one behind is about to play.
    #[test]
    fn a_reader_further_ahead_does_not_prune_a_reader_behind_it() {
        let w = window(Some(KEEP_BEHIND_SEGS + 2));
        w.note(KEEP_BEHIND_SEGS * 4);

        assert_eq!(w.cutoff(), Some(2));
        assert!(!w.is_pruned(2));
    }

    #[test]
    fn a_request_for_a_pruned_segment_does_not_reopen_the_window() {
        let w = window(Some(KEEP_BEHIND_SEGS + 100));
        assert_eq!(w.cutoff(), Some(100));

        assert!(!w.note(5), "a backward seek the reaper already deleted");
        assert_eq!(w.cutoff(), None);

        w.note(KEEP_BEHIND_SEGS + 200);
        assert_eq!(w.cutoff(), Some(200), "a servable request still advances it");
    }

    #[test]
    fn the_floor_resets_each_round_so_a_seek_back_is_not_pruned() {
        let w = window(Some(KEEP_BEHIND_SEGS + 100));
        assert_eq!(w.cutoff(), Some(100));

        w.note(KEEP_BEHIND_SEGS + 120);

        assert_eq!(w.cutoff(), Some(120), "a later round never prunes past its own floor");
        assert!(w.is_pruned(119));
    }
}
