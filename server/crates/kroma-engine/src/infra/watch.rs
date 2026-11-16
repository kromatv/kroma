//! Library watcher: a periodic re-scan, the reliable path for network mounts
//! (SMB/NFS deliver no change events for edits made on the NAS itself), plus a
//! best-effort `notify` watcher, both feeding one debounced worker thread.

use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::Duration;

use notify::{RecursiveMode, Watcher};
use tokio::runtime::Handle;
use tracing::{info, warn};

use crate::model::MediaItem;
use crate::services::jobs::{Trigger, TriggerError};
use crate::services::scan;
use crate::state::SharedState;

const DEFAULT_INTERVAL_SECS: u64 = 300;
const DEBOUNCE: Duration = Duration::from_secs(2);

/// `baseline` is the startup scan's signature: nothing is re-emitted until the
/// file set changes.
pub fn spawn(state: SharedState, baseline: u64) {
    if state.config.media_dirs.is_empty() {
        return; // demo mode nothing on disk to watch
    }
    // Captured on the tokio thread: the watcher's std::thread has no runtime.
    let handle = Handle::current();

    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<()>();
        let watcher = make_watcher(&state, tx); // kept alive for the thread's life
        info!(fs_events = watcher.is_some(), "library watcher started");

        watch_loop(&state, &handle, &rx, baseline);
        drop(watcher);
    });
}

fn watch_loop(state: &SharedState, handle: &Handle, rx: &mpsc::Receiver<()>, baseline: u64) {
    let mut last = baseline;
    loop {
        // Re-read each iteration so an admin change needs no restart.
        let interval = watch_interval(state);
        let recv = if interval > 0 {
            rx.recv_timeout(Duration::from_secs(interval))
        } else {
            rx.recv().map_err(|_| RecvTimeoutError::Disconnected)
        };
        let from_event = match recv {
            Ok(()) => true,
            Err(RecvTimeoutError::Timeout) => false,
            Err(RecvTimeoutError::Disconnected) => break,
        };
        if from_event {
            while rx.recv_timeout(DEBOUNCE).is_ok() {}
        }
        trigger_if_changed(state, handle, &mut last);
    }
}

// Seconds; `0` disables the periodic tick (FS events still fire).
fn watch_interval(state: &SharedState) -> u64 {
    match state.settings.get_i64("watchIntervalSecs", -1) {
        n if n >= 0 => n as u64,
        _ => std::env::var("KROMA_WATCH_INTERVAL")
            .ok()
            .and_then(|s| s.trim().parse::<u64>().ok())
            .unwrap_or(DEFAULT_INTERVAL_SECS),
    }
}

fn make_watcher(state: &SharedState, tx: mpsc::Sender<()>) -> Option<notify::RecommendedWatcher> {
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if res.is_ok() {
            let _ = tx.send(());
        }
    })
    .map_err(|e| warn!(error = %e, "filesystem watcher unavailable (periodic re-scan only)"))
    .ok()?;

    for dir in crate::services::settings::all_folders(&state.settings, &state.config) {
        if let Err(e) = watcher.watch(&dir, RecursiveMode::Recursive) {
            warn!(path = %dir.display(), error = %e, "could not watch media dir");
        }
    }
    Some(watcher)
}

fn trigger_if_changed(state: &SharedState, handle: &Handle, last: &mut u64) {
    if !state.settings.get_bool("watchAutoScan", true) {
        return; // auto-scan disabled by the admin
    }
    let defs = crate::services::settings::library_defs(&state.settings, &state.config);
    let data = scan::scan_all(&defs);
    let sig = signature(&data.items, &data.mtimes);
    if sig == *last {
        return; // nothing changed
    }
    info!("watcher: filesystem change detected triggering library-change jobs");

    // A scan already in flight may predate the new file, so `AlreadyRunning`
    // keeps `last` and retries next tick instead of consuming the change.
    let jobs = state.jobs.clone();
    let st = state.clone();
    let owned = handle.block_on(async move {
        let mut started = false;
        let mut busy = false;
        for id in jobs.jobs_for_trigger(Trigger::LibraryChange) {
            match jobs.trigger(st.clone(), id, "watch") {
                Ok(_) => started = true,
                Err(TriggerError::AlreadyRunning) => busy = true,
                Err(TriggerError::Unknown) => {}
            }
        }
        started || !busy
    });
    if owned {
        *last = sig;
    }
}

/// A digest of every file's path, size and mtime, in no particular order: a
/// file added, removed, moved, renamed, resized or touched changes it.
pub fn signature(items: &[MediaItem], mtimes: &HashMap<String, Option<i64>>) -> u64 {
    items
        .iter()
        .flat_map(|item| &item.files)
        .fold(0u64, |acc, f| {
            let mut h = DefaultHasher::new();
            (&f.id, f.size, mtimes.get(&f.id).copied().flatten()).hash(&mut h);
            acc.wrapping_add(h.finish())
        })
}

#[cfg(test)]
mod tests;
