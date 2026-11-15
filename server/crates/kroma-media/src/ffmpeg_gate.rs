//! A process-wide cap on the heavy ffmpeg passes running at once, by count and
//! by memory.
//!
//! Every CPU-heavy media source (storyboard tiles/montage/jpeg, subtitle
//! extraction, marker fingerprinting, on-demand storyboard scrubbing) draws
//! from one budget here instead of each subsystem sizing its own worker pool
//! blind to the others. The count is live: [`set_capacity`] is called at
//! startup from the `mediaConcurrency` admin setting and again whenever it
//! changes, so an operator can retune it without a restart.
//!
//! Each pass also names its [`Footprint`]. Where the host publishes
//! `/proc/meminfo` (Linux), a pass starts only while the host is not swapping
//! memory back in, and only when its footprint, plus those of the passes
//! already running, fits in `MemAvailable` minus a reserve kept for the rest
//! of the box. Elsewhere the count alone decides.
//!
//! A hand-rolled counting semaphore (Mutex + Condvar): every caller runs on a
//! blocking thread, so a blocking acquire is correct and avoids pulling an
//! async runtime into the leaf process plumbing. A waiter also wakes on a short
//! timer, since memory comes back without anyone signalling it. No caller holds
//! a permit while waiting on another, so the single-budget gate cannot
//! deadlock.
//!
//! [`reserve`] is the other half: work a viewer is waiting on does not draw from
//! the budget, it takes the budget away, because a box that is finishing a
//! storyboard is a box that is not finishing the next segment.

mod footprint;
mod host;

use std::sync::{Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

use tracing::warn;

pub use footprint::Footprint;

use footprint::MIB;
use host::{Reading, Swap, SwapWatch};

struct Gate {
    inner: Mutex<Inner>,
    changed: Condvar,
}

struct Inner {
    capacity: usize,
    in_use: usize,
    reserved: usize,
    committed: u64,
    swap: SwapWatch,
    warned: Option<Instant>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Hold {
    Busy,
    Unmeasured,
    Swapping(u64),
    Short { need: u64, room: u64 },
}

// What background work is left while the box is reserved. Not zero: a paused
// library is worse than a slow one, and one pass at a time still finishes.
const RESERVED_FLOOR: usize = 1;
const RECHECK: Duration = Duration::from_millis(250);
const WARN_EVERY: Duration = Duration::from_secs(300);

impl Inner {
    fn new(capacity: usize) -> Self {
        Self {
            capacity,
            in_use: 0,
            reserved: 0,
            committed: 0,
            swap: SwapWatch::default(),
            warned: None,
        }
    }

    fn effective(&self) -> usize {
        if self.reserved > 0 {
            RESERVED_FLOOR.min(self.capacity)
        } else {
            self.capacity
        }
    }

    fn fits(&self, need: Footprint, host: Option<Reading>) -> Result<(), Hold> {
        let Some(host) = host else {
            return Ok(());
        };
        match host.swap {
            Swap::Swapping(pages_per_s) => return Err(Hold::Swapping(pages_per_s)),
            Swap::Unmeasured => return Err(Hold::Unmeasured),
            Swap::Calm => {}
        }
        let room = host
            .memory
            .available
            .saturating_sub(host.memory.reserve())
            .saturating_sub(self.committed);
        match need.bytes() <= room {
            true => Ok(()),
            false => Err(Hold::Short {
                need: need.bytes(),
                room,
            }),
        }
    }

    fn try_admit(&mut self, need: Footprint, now: Instant) -> bool {
        let verdict = match self.in_use < self.effective() {
            false => Err(Hold::Busy),
            true => {
                let reading = host::read(&mut self.swap, now);
                self.fits(need, reading)
            }
        };
        match verdict {
            Ok(()) => {
                self.in_use += 1;
                self.committed += need.bytes();
                true
            }
            Err(hold) => {
                self.report(hold, now);
                false
            }
        }
    }

    fn report(&mut self, hold: Hold, now: Instant) {
        if self
            .warned
            .is_some_and(|at| now.saturating_duration_since(at) < WARN_EVERY)
        {
            return;
        }
        match hold {
            Hold::Busy | Hold::Unmeasured => return,
            Hold::Swapping(pages_per_s) => {
                warn!(
                    pages_per_s,
                    "media passes wait: the host is swapping memory back in"
                );
            }
            Hold::Short { need, room } => warn!(
                need_mib = need / MIB,
                room_mib = room / MIB,
                "media passes wait: not enough memory free beside the system's reserve"
            ),
        }
        self.warned = Some(now);
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

/// The ffmpeg budget an operator's `mediaConcurrency` asks for: 1..=32, and
/// `0` or less is [`auto_capacity`].
pub fn capacity_from(setting: i64) -> usize {
    match setting {
        n if n > 0 => (n as usize).clamp(1, 32),
        _ => auto_capacity(),
    }
}

fn gate() -> &'static Gate {
    GATE.get_or_init(|| Gate {
        inner: Mutex::new(Inner::new(auto_capacity())),
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

/// Held for the lifetime of one ffmpeg pass; returns its slot and its footprint
/// to the pool on drop (including on panic or an early `?` return), so neither
/// is ever leaked.
pub struct Permit(Footprint);

impl Drop for Permit {
    fn drop(&mut self) {
        let gate = gate();
        {
            let mut inner = gate.inner.lock().unwrap();
            inner.in_use = inner.in_use.saturating_sub(1);
            inner.committed = inner.committed.saturating_sub(self.0.bytes());
        }
        gate.changed.notify_all();
    }
}

/// Block until a slot is free and the host can hold `need`, then take it. Call
/// right before spawning ffmpeg and keep the returned permit alive (bind it, do
/// not `let _ = `) until the process has exited.
#[must_use]
pub fn acquire(need: Footprint) -> Permit {
    let gate = gate();
    let mut inner = gate.inner.lock().unwrap();
    while !inner.try_admit(need, Instant::now()) {
        inner = gate.changed.wait_timeout(inner, RECHECK).unwrap().0;
    }
    Permit(need)
}

/// [`acquire`] that gives up, answering `None`, the moment `cancel` flips, so a
/// cancelled job is not left queued behind a box short of memory.
#[must_use]
pub fn acquire_cancellable(need: Footprint, cancel: &dyn Fn() -> bool) -> Option<Permit> {
    let gate = gate();
    let mut inner = gate.inner.lock().unwrap();
    while !inner.try_admit(need, Instant::now()) {
        if cancel() {
            return None;
        }
        inner = gate.changed.wait_timeout(inner, RECHECK).unwrap().0;
    }
    Some(Permit(need))
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
mod tests;
