//! A process-wide cap on how many heavy ffmpeg passes run at once.
//!
//! Every CPU-heavy media source (storyboard tiles/montage/jpeg, subtitle
//! extraction, marker fingerprinting, on-demand storyboard scrubbing) draws
//! from one budget here instead of each subsystem sizing its own worker pool
//! blind to the others. The budget is live: [`set_capacity`] is called at
//! startup from the `mediaConcurrency` admin setting and again whenever it
//! changes, so an operator can retune it without a restart.
//!
//! A hand-rolled counting semaphore (Mutex + Condvar): every caller runs on a
//! blocking thread, so a blocking acquire is correct and avoids pulling an
//! async runtime into the leaf process plumbing. No caller holds a permit
//! while waiting on another, so the single-budget gate cannot deadlock.
//!
//! [`reserve`] is the other half: work a viewer is waiting on does not draw from
//! the budget, it takes the budget away, because a box that is finishing a
//! storyboard is a box that is not finishing the next segment.

use std::sync::{Condvar, Mutex, OnceLock};

struct Gate {
    inner: Mutex<Inner>,
    changed: Condvar,
}

struct Inner {
    capacity: usize,
    in_use: usize,
    reserved: usize,
}

// What background work is left while the box is reserved. Not zero: a paused
// library is worse than a slow one, and one pass at a time still finishes.
const RESERVED_FLOOR: usize = 1;

impl Inner {
    fn effective(&self) -> usize {
        if self.reserved > 0 {
            RESERVED_FLOOR.min(self.capacity)
        } else {
            self.capacity
        }
    }
}

static GATE: OnceLock<Gate> = OnceLock::new();

/// The budget used before [`set_capacity`] runs (e.g. an on-demand storyboard
/// generated before `AppState::new` seeds the setting) and the fallback when the
/// setting says "auto". `KROMA_FFMPEG_CONCURRENCY` overrides for ops/debugging;
/// otherwise `cores - 1` so the box always keeps a core, floored at 1.
pub fn auto_capacity() -> usize {
    if let Some(n) = std::env::var("KROMA_FFMPEG_CONCURRENCY")
        .ok()
        .and_then(|v| v.trim().parse::<usize>().ok())
        .filter(|n| *n > 0)
    {
        return n;
    }
    let cores = std::thread::available_parallelism()
        .map(std::num::NonZeroUsize::get)
        .unwrap_or(4);
    cores.saturating_sub(1).max(1)
}

fn gate() -> &'static Gate {
    GATE.get_or_init(|| Gate {
        inner: Mutex::new(Inner {
            capacity: auto_capacity(),
            in_use: 0,
            reserved: 0,
        }),
        changed: Condvar::new(),
    })
}

/// Set the live budget (clamped to >= 1). Growing it wakes any blocked waiters so
/// the extra slots are taken up immediately; shrinking it just lets the current
/// passes drain (a permit already granted is never revoked mid-flight).
pub fn set_capacity(permits: usize) {
    let gate = gate();
    {
        let mut inner = gate.inner.lock().unwrap();
        inner.capacity = permits.max(1);
    }
    gate.changed.notify_all();
}

/// Held for the lifetime of one ffmpeg pass; returns its slot to the pool on drop
/// (including on panic or an early `?` return), so a slot is never leaked.
pub struct Permit;

impl Drop for Permit {
    fn drop(&mut self) {
        let gate = gate();
        {
            let mut inner = gate.inner.lock().unwrap();
            inner.in_use = inner.in_use.saturating_sub(1);
        }
        gate.changed.notify_one();
    }
}

/// Block until a slot is free, then take it. Call right before spawning ffmpeg and
/// keep the returned permit alive (bind it, do not `let _ = `) until the process
/// has exited.
#[must_use]
pub fn acquire() -> Permit {
    let gate = gate();
    let mut inner = gate.inner.lock().unwrap();
    while inner.in_use >= inner.effective() {
        inner = gate.changed.wait(inner).unwrap();
    }
    inner.in_use += 1;
    Permit
}

/// Held for as long as something the viewer is waiting on owns the box: the
/// background budget drops to one pass until it is dropped.
///
/// A live software re-encode is the case this exists for. It runs outside the
/// gate (it is not a pass, it is the stream), so nothing stopped a storyboard
/// fan-out from taking `cores - 1` of a four-core NAS while a player waited on
/// the next segment. A permit already granted is never revoked, so the pass in
/// flight finishes and the next one queues.
pub struct Reservation;

impl Drop for Reservation {
    fn drop(&mut self) {
        let gate = gate();
        {
            let mut inner = gate.inner.lock().unwrap();
            inner.reserved = inner.reserved.saturating_sub(1);
        }
        gate.changed.notify_all();
    }
}

#[must_use]
pub fn reserve() -> Reservation {
    let mut inner = gate().inner.lock().unwrap();
    inner.reserved += 1;
    Reservation
}

#[cfg(test)]
mod tests {
    use super::*;

    const fn inner(capacity: usize, reserved: usize) -> Inner {
        Inner {
            capacity,
            in_use: 0,
            reserved,
        }
    }

    #[test]
    fn an_unreserved_box_spends_its_whole_budget() {
        assert_eq!(inner(7, 0).effective(), 7);
    }

    #[test]
    fn a_reservation_leaves_background_work_one_pass_at_a_time() {
        assert_eq!(inner(7, 1).effective(), 1);
    }

    #[test]
    fn two_viewers_do_not_take_the_box_away_twice_over() {
        assert_eq!(inner(7, 2).effective(), 1);
    }

    #[test]
    fn the_floor_never_hands_out_more_than_the_operator_allowed() {
        assert_eq!(inner(1, 1).effective(), 1);
    }
}
