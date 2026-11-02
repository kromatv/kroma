//! Keeping the running set matching what is installed: the hot-reload loop a
//! dev build swaps a component under, and the watchdog that restarts a component
//! whose library folders moved.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use kroma_module_host::HostCtx;

use super::{Supervisor, MODULE_COMPONENT};

// Fast enough that a rebuild feels immediate, slow enough to be free when idle.
const HOT_RELOAD_POLL: Duration = Duration::from_millis(400);

#[cfg(unix)]
const MEDIA_CHECK: Duration = Duration::from_secs(30);

impl Supervisor {
    /// Watch every running module's component and restart the ones that change.
    ///
    /// This is the module half of `cargo watch`: a dev loop rebuilds a module
    /// and drops its `module.wasm` in, and the component running the old code is
    /// swapped for one running the new. Off unless `KROMA_MODULE_HOT_RELOAD=1`,
    /// so a production server never polls the filesystem for this.
    pub fn spawn_hot_reload(self: &Arc<Self>) {
        if std::env::var("KROMA_MODULE_HOT_RELOAD").as_deref() != Ok("1") {
            return;
        }
        let this = self.clone();
        tracing::info!("module hot reload armed: a changed module.wasm restarts its component");
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

    /// The ids with a live entry in the running map. Bound in its own statement
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
                Ok(_) => self.say(&id, "INFO module back up after a failed hot reload"),
                Err(e) => {
                    self.say(&id, &format!("ERROR module still down: {e:#}"));
                    down.insert(id);
                }
            }
        }
    }

    // Restart one module if its component is not the one it started with. The
    // first sighting only records the stamp: that IS the component already running.
    fn reload_if_changed(
        &self,
        id: &str,
        seen: &mut HashMap<String, std::time::SystemTime>,
        down: &mut std::collections::HashSet<String>,
    ) {
        let Ok(stamp) =
            std::fs::metadata(self.dir(id).join(MODULE_COMPONENT)).and_then(|m| m.modified())
        else {
            return;
        };
        let changed = matches!(seen.get(id), Some(&last) if last != stamp);
        seen.insert(id.to_string(), stamp);
        if !changed {
            return;
        }
        tracing::info!(module = %id, "component changed; restarting the module");
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

    /// Restart, every half minute, each running module that reaches the `media`
    /// root and whose library folders changed: a component holds the folders it
    /// started with, so one added later is only there after a restart.
    pub fn spawn_watchdog(self: &Arc<Self>) {
        #[cfg(unix)]
        {
            let this = self.clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(MEDIA_CHECK);
                this.restart_where_media_moved();
            });
        }
    }

    #[cfg(unix)]
    fn restart_where_media_moved(&self) {
        let Some(wiring) = self.gateway.get() else {
            return;
        };
        let wanted = (wiring.media())();
        let moved: Vec<String> = self
            .procs
            .read()
            .unwrap()
            .iter()
            .filter(|(_, proc)| {
                proc.media
                    .as_ref()
                    .is_some_and(|media| !media.is_empty() && *media != wanted)
            })
            .map(|(id, _)| id.clone())
            .collect();
        for id in moved {
            self.say(&id, "INFO restarting: the library folders changed");
            self.stop(&id);
            if let Err(e) = self.start_installed(&id) {
                self.say(&id, &format!("ERROR restart failed: {e:#}"));
            }
        }
    }

    pub fn spawn_enabled(&self, host: &dyn HostCtx) {
        for manifest in self.installed_manifests() {
            let id = manifest.id.as_str();
            if !host.module_enabled(id) {
                continue;
            }
            if let Err(e) = self.start_installed(id) {
                tracing::error!(module = %id, error = %format!("{e:#}"), "module not started");
                // Also on the module's own channel: a module that never came up
                // is the first thing looked for in Admin > Journaux, and the core
                // log is not where it is looked for.
                self.say(id, &format!("ERROR module did not start: {e:#}"));
            }
        }
    }
}
