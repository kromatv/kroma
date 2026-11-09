//! mimalloc returns a freed page to the system only when a later allocation
//! comes round to it, so what a compile or a burst of calls freed can stay
//! resident for minutes, long enough to be swapped out on a small NAS.

use std::time::Duration;

const COLLECT_EVERY: Duration = Duration::from_secs(10);

/// Start the thread that has mimalloc purge, every few seconds, the freed pages
/// it queued for purging, whichever thread queued them.
pub fn spawn_collector() {
    let spawned = std::thread::Builder::new()
        .name("kroma-mi-collect".into())
        .spawn(|| loop {
            std::thread::sleep(COLLECT_EVERY);
            // SAFETY: mi_collect takes no pointer; it only purges pages that no
            // live allocation lies in.
            unsafe { libmimalloc_sys::mi_collect(true) };
        });
    if let Err(error) = spawned {
        tracing::warn!(%error, "the allocator's collector did not start");
    }
}
