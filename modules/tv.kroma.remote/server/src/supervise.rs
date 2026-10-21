use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

use tokio::process::Child;
use tracing::{info, warn};

use kroma_module_sdk::host::HostCtx;

use crate::access::RemoteAccess;
#[cfg(unix)]
use crate::process::tunnel_needle;
use crate::process::{drain, spawn_tunnel};

const RECONCILE_SECS: u64 = 3;

impl RemoteAccess {
    // Also reaps the exit status if the child died.
    pub(crate) async fn alive(&self) -> bool {
        let mut g = self.inner.lock().await;
        match g.child.as_mut() {
            None => false,
            Some(child) => match child.try_wait() {
                Ok(None) => true,
                Ok(Some(status)) => {
                    g.running = false;
                    g.child = None;
                    g.last_error = Some(format!("cloudflared exited ({status})"));
                    false
                }
                Err(_) => true,
            },
        }
    }

    // Kills the tracked child AND any cloudflared orphaned by a SIGKILL of a
    // previous sidecar generation (the supervisor SIGKILLs sidecars on update,
    // which leaves their cloudflared running but no longer held by this
    // process's in-memory handle - so killing only the tracked child left the
    // tunnel up after "disable"). Reaps the tracked child to avoid a zombie.
    pub(crate) async fn kill_child(&self) {
        let child = {
            let mut g = self.inner.lock().await;
            g.running = false;
            g.child.take()
        };
        let had = child.is_some();
        if let Some(mut child) = child {
            let _ = child.start_kill();
            let _ = child.wait().await;
        }
        #[cfg(unix)]
        self.kill_all_cloudflared();
        if had {
            info!("remote access: cloudflared connector stopped");
        }
    }

    // SIGKILLs every process running OUR `cloudflared` binary as a tunnel - the
    // tracked child plus any orphan from a prior generation. Matching the
    // resolved binary path is safe: nothing else on the box runs it. Best-effort.
    #[cfg(unix)]
    pub(crate) fn kill_all_cloudflared(&self) {
        let needle = tunnel_needle(&self.resolve_binary());
        let Ok(out) = std::process::Command::new("ps").arg("aux").output() else {
            return;
        };
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            if line.contains(&needle) {
                // `ps aux`: USER PID ... - the pid is the second whitespace field.
                if let Some(pid) = line.split_whitespace().nth(1) {
                    let _ = std::process::Command::new("kill")
                        .args(["-9", pid])
                        .status();
                }
            }
        }
    }

    // Non-blocking; guarded by the `starting` flag so only one launch runs at
    // a time.
    pub(crate) fn launch(self: Arc<Self>, token: String) {
        tokio::spawn(async move {
            {
                let mut g = self.inner.lock().await;
                if g.starting {
                    return;
                }
                g.starting = true;
                g.last_error = None;
            }
            // Clear any orphan from a prior sidecar generation before spawning a
            // fresh tracked child, so exactly one connector ever runs (else an
            // untracked orphan keeps serving the tunnel after a later "disable").
            #[cfg(unix)]
            self.kill_all_cloudflared();
            let result = self.spawn_child(token).await;
            {
                let mut g = self.inner.lock().await;
                g.starting = false;
                match result {
                    Ok(child) => {
                        g.child = Some(child);
                        g.running = true;
                        g.since = Some(kroma_module_sdk::primitives::now_iso8601());
                        info!("remote access: cloudflared connector started");
                    }
                    Err(e) => {
                        g.running = false;
                        g.last_error = Some(e.clone());
                        warn!("remote access: {e}");
                    }
                }
            }
            // A shutdown that landed mid-launch found no child to kill (this one
            // did not exist yet), so honour it now rather than leaving a
            // connector running with nothing left to supervise it.
            if self.stopping.load(Ordering::SeqCst) {
                self.kill_child().await;
            }
        });
    }

    // Wires the child's stdout/stderr into the log ring. Does not touch shared
    // start/running state (the caller does).
    pub(crate) async fn spawn_child(self: &Arc<Self>, token: String) -> Result<Child, String> {
        let bin = self.ensure_binary().await?;
        let mut child = spawn_tunnel(&bin, &token)
            .await
            .map_err(|e| format!("failed to launch cloudflared ({bin}): {e}"))?;
        // Drain stdout + stderr into the log ring so the panel shows connection
        // progress ("Registered tunnel connection …") and any error.
        if let Some(out) = child.stdout.take() {
            let me = self.clone();
            tokio::spawn(async move { drain(me, out).await });
        }
        if let Some(err) = child.stderr.take() {
            let me = self.clone();
            tokio::spawn(async move { drain(me, err).await });
        }
        Ok(child)
    }

    /// One reconcile step: make the running connector match the persisted setting.
    /// Enabled + token → launch (if down and not already starting); otherwise →
    /// kill. Called both by the loop and immediately after a settings change so
    /// the panel reflects the action without waiting a full tick.
    ///
    /// A latched [`Self::shutdown`] outranks the setting: the module is going
    /// away, so the only correct state is "connector down".
    pub async fn reconcile(self: &Arc<Self>, host: &dyn HostCtx) {
        let enabled = host.setting_bool("remoteAccess", false);
        let token = host.setting_str("remoteAccessToken", "");
        let desired = enabled && !token.trim().is_empty() && !self.stopping.load(Ordering::SeqCst);
        let alive = self.alive().await;
        let starting = self.inner.lock().await.starting;
        if desired {
            if !alive && !starting {
                self.clone().launch(token);
            }
        } else if alive {
            self.kill_child().await;
        }
    }

    /// Take the connector down for good: latch the reconcile loop off, then kill
    /// the child. Idempotent, and awaited by the callers that matter: the
    /// module being disabled and the sidecar being asked to exit, so the tunnel
    /// is gone before this process is.
    pub async fn shutdown(&self) {
        self.stopping.store(true, Ordering::SeqCst);
        self.kill_child().await;
        info!("remote access: connector shut down");
    }

    /// Boot hook: run the reconcile loop forever. Brings the tunnel up at boot if
    /// the admin left it enabled with a token, keeps it alive if the child dies,
    /// and takes it down promptly once disabled. No-op while disabled.
    pub fn spawn_boot(self: Arc<Self>, host: Arc<dyn HostCtx>) {
        // Re-enabling clears a previous shutdown; the running loop, if any, then
        // reconciles back up on its own tick.
        self.stopping.store(false, Ordering::SeqCst);
        if self.watching.swap(true, Ordering::SeqCst) {
            return;
        }
        tokio::spawn(async move {
            // A prior generation killed outright (SIGKILL, a crash) left its
            // connector running and untracked. Nothing else will ever reap it:
            // while `remoteAccess` is off the reconcile loop has no live child
            // to notice, so claim the slot before the first reconcile.
            #[cfg(unix)]
            self.kill_all_cloudflared();
            loop {
                self.reconcile(&*host).await;
                tokio::time::sleep(Duration::from_secs(RECONCILE_SECS)).await;
            }
        });
    }
}

#[cfg(all(test, unix))]
mod tests {
    use serde_json::json;

    use kroma_module_sdk::host::HostCtx;

    use crate::test_support::{
        enabled, eventually, host, install_inert_file, install_script, remote_for, EXITING, RUNNING,
    };

    use super::*;

    #[tokio::test]
    async fn launches_the_connector_when_enabled_with_a_token_and_stops_it_when_disabled() {
        let host = enabled(host());
        let remote = remote_for(&host);
        install_script(host.data_dir(), RUNNING);

        remote.reconcile(&host).await;
        eventually(|| async { remote.status().await.running }).await;
        let started = remote.status().await;
        host.set_settings([("remoteAccess".to_string(), json!(false))].into());
        remote.reconcile(&host).await;

        assert!(started.since.is_some());
        eventually(|| async { remote.status().await.logs.iter().any(|l| l == "hello") }).await;
        assert!(!remote.status().await.running);
        assert!(!remote.alive().await);
    }

    #[tokio::test]
    async fn records_why_the_connector_could_not_launch() {
        let host = enabled(host());
        let remote = remote_for(&host);
        install_inert_file(host.data_dir());

        remote.reconcile(&host).await;

        eventually(|| async {
            remote
                .status()
                .await
                .last_error
                .is_some_and(|e| e.contains("failed to launch cloudflared"))
        })
        .await;
        assert!(!remote.status().await.running);
    }

    #[tokio::test]
    async fn reports_a_connector_that_exited() {
        let host = enabled(host());
        let remote = remote_for(&host);
        install_script(host.data_dir(), EXITING);

        remote.reconcile(&host).await;

        eventually(|| async {
            remote
                .status()
                .await
                .last_error
                .is_some_and(|e| e.contains("cloudflared exited"))
        })
        .await;
        assert!(!remote.status().await.running);
    }

    #[tokio::test]
    async fn notices_through_reconcile_that_the_child_died() {
        let host = enabled(host());
        let remote = remote_for(&host);
        install_script(host.data_dir(), EXITING);
        remote.reconcile(&host).await;
        eventually(|| async { remote.inner.lock().await.child.is_some() }).await;

        eventually(|| async { !remote.alive().await }).await;

        let last_error = remote.inner.lock().await.last_error.clone();
        assert!(last_error.is_some_and(|e| e.contains("cloudflared exited")));
    }

    #[tokio::test]
    async fn stays_down_after_a_shutdown_even_when_enabled() {
        let host = enabled(host());
        let remote = remote_for(&host);
        install_script(host.data_dir(), RUNNING);

        remote.shutdown().await;
        remote.reconcile(&host).await;

        let inner = remote.inner.lock().await;
        assert!(inner.child.is_none() && !inner.starting && !inner.running);
    }

    #[tokio::test]
    async fn boots_one_reconcile_loop_however_often_it_is_called() {
        let host = enabled(host());
        let remote = remote_for(&host);
        install_script(host.data_dir(), RUNNING);

        remote.clone().spawn_boot(Arc::new(host.clone()));
        remote.clone().spawn_boot(Arc::new(host.clone()));

        eventually(|| async { remote.status().await.running }).await;
        assert!(remote.watching.load(Ordering::SeqCst));
        remote.shutdown().await;
    }
}
