//! Keeping the running set matching what is installed: the hot-reload loop a
//! dev build swaps a binary under, and the watchdog that restarts a sidecar
//! that died.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use kroma_module_host::HostCtx;

use super::{Supervisor, MODULE_BIN};

// Fast enough that a rebuild feels immediate, slow enough to be free when idle.
const HOT_RELOAD_POLL: Duration = Duration::from_millis(400);

const WATCHDOG_POLL: Duration = Duration::from_secs(2);
const WATCHDOG_BACKOFF_MIN: Duration = Duration::from_secs(2);
const WATCHDOG_BACKOFF_MAX: Duration = Duration::from_secs(60);

impl Supervisor {
    /// Watch every running module's binary and restart the ones that change.
    ///
    /// This is the module half of `cargo watch`: a dev loop rebuilds a sidecar
    /// and drops the binary in, and the process running the old code is swapped
    /// for one running the new. Off unless `KROMA_MODULE_HOT_RELOAD=1`, so a
    /// production server never polls the filesystem for this.
    pub fn spawn_hot_reload(self: &Arc<Self>) {
        if std::env::var("KROMA_MODULE_HOT_RELOAD").as_deref() != Ok("1") {
            return;
        }
        let this = self.clone();
        tracing::info!("module hot reload armed: a changed sidecar binary restarts its process");
        std::thread::spawn(move || {
            let mut seen: HashMap<String, std::time::SystemTime> = HashMap::new();
            // A restart that fails takes the module out of `procs`, so watching
            // only what is running would drop it from the loop and leave it dead
            // and silent until the server itself restarted. It stays here until
            // it comes back.
            let mut down: std::collections::HashSet<String> = std::collections::HashSet::new();
            loop {
                std::thread::sleep(HOT_RELOAD_POLL);
                this.retry_failed_reloads(&mut down);
                for id in this.running_ids() {
                    this.reload_if_changed(&id, &mut seen, &mut down);
                }
            }
        });
    }

    /// The ids with a live entry in the process map. Bound in its own statement
    /// so the read guard is DROPPED before the caller acts: held across a
    /// restart it would deadlock against `stop`'s write lock.
    fn running_ids(&self) -> Vec<String> {
        self.procs.read().unwrap().keys().cloned().collect()
    }

    // Modules whose last restart failed, tried again. One stays in `down` until
    // it comes back, so a broken build is retried rather than forgotten.
    fn retry_failed_reloads(&self, down: &mut std::collections::HashSet<String>) {
        for id in std::mem::take(down) {
            match self.start_installed(&id) {
                Ok(_) => self.say(&id, "INFO sidecar back up after a failed hot reload"),
                Err(e) => {
                    self.say(&id, &format!("ERROR sidecar still down: {e:#}"));
                    down.insert(id);
                }
            }
        }
    }

    // Restart one module if its binary is not the one it started with. The first
    // sighting only records the stamp: that IS the binary already running.
    fn reload_if_changed(
        &self,
        id: &str,
        seen: &mut HashMap<String, std::time::SystemTime>,
        down: &mut std::collections::HashSet<String>,
    ) {
        let Ok(stamp) = std::fs::metadata(self.dir(id).join(MODULE_BIN)).and_then(|m| m.modified())
        else {
            return;
        };
        let changed = matches!(seen.get(id), Some(&last) if last != stamp);
        seen.insert(id.to_string(), stamp);
        if !changed {
            return;
        }
        tracing::info!(module = %id, "binary changed; restarting the sidecar");
        self.stop(id);
        if let Err(e) = self.start_installed(id) {
            tracing::error!(
                module = %id,
                error = %format!("{e:#}"),
                "hot reload failed; retrying every poll",
            );
            self.say(id, &format!("ERROR hot reload failed: {e:#}"));
            down.insert(id.to_string());
        }
    }

    /// Watch the running sidecars and bring back any that exits. A module that
    /// dies takes its whole feature with it (a dead acquisition sidecar is a
    /// request page that answers "this feature is disabled"), and until this
    /// existed it did so without a word and stayed down until the next restart.
    ///
    /// Backs off on a module that will not stay up, so a crash loop costs one
    /// line a minute rather than a spin.
    pub fn spawn_watchdog(self: &Arc<Self>) {
        let this = self.clone();
        std::thread::spawn(move || {
            let mut backoff: HashMap<String, Duration> = HashMap::new();
            let mut due: HashMap<String, Instant> = HashMap::new();
            loop {
                std::thread::sleep(WATCHDOG_POLL);
                for id in this.reap_exited() {
                    let wait = backoff.get(&id).copied().unwrap_or(WATCHDOG_POLL);
                    due.insert(id, Instant::now() + wait);
                }
                let ready: Vec<String> = due
                    .iter()
                    .filter(|(_, at)| Instant::now() >= **at)
                    .map(|(id, _)| id.clone())
                    .collect();
                for id in ready {
                    due.remove(&id);
                    match this.start_installed(&id) {
                        Ok(_) => {
                            backoff.remove(&id);
                            this.say(&id, "INFO module process restarted after an exit");
                        }
                        Err(e) => {
                            let next = backoff.get(&id).map_or(WATCHDOG_BACKOFF_MIN, |d| {
                                (*d * 2).min(WATCHDOG_BACKOFF_MAX)
                            });
                            backoff.insert(id.clone(), next);
                            due.insert(id.clone(), Instant::now() + next);
                            tracing::error!(
                                module = %id,
                                error = %format!("{e:#}"),
                                retry_in_s = next.as_secs(),
                                "module restart failed",
                            );
                            this.say(&id, &format!("ERROR restart failed: {e:#}"));
                        }
                    }
                }
            }
        });
    }

    pub fn spawn_enabled(&self, host: &dyn HostCtx) {
        for manifest in self.installed_manifests() {
            let id = manifest.id.as_str();
            if !host.module_enabled(id) {
                continue;
            }
            if let Err(e) = self.start_installed(id) {
                tracing::error!(module = %id, error = %format!("{e:#}"), "module not spawned");
                // Also on the module's own channel: a module that never came up
                // is the first thing looked for in Admin > Journaux, and the core
                // log is not where it is looked for.
                self.say(id, &format!("ERROR module did not start: {e:#}"));
            }
        }
    }
}
