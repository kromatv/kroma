use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use crate::process::{record_pid, spawn_child};
use crate::vpn::Vpn;

impl Vpn {
    /// While `generation` is the active config, respawn the child (with a small
    /// backoff) whenever it dies. The kill switch covers the gap. Respawns
    /// re-run the child directly, never `apply`.
    pub(crate) fn supervise(self: Arc<Self>, generation: u64, bin: PathBuf, conf_path: PathBuf) {
        let me = self;
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                if !me.is_current(generation) {
                    return;
                }
                match me.child_died().await {
                    // No child left to watch: a `stop` took it.
                    None => return,
                    Some(false) => continue,
                    Some(true) => {}
                }
                tracing::warn!("wireguard bridge exited; restarting in 5s");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                if !me.respawn(generation, &bin, &conf_path).await {
                    return;
                }
            }
        });
    }

    fn is_current(&self, generation: u64) -> bool {
        self.generation.load(Ordering::SeqCst) == generation
    }

    /// Whether the child has exited, or `None` when there is no longer one.
    async fn child_died(&self) -> Option<bool> {
        let mut guard = self.child.lock().await;
        let child = guard.as_mut()?;
        Some(child.try_wait().map(|s| s.is_some()).unwrap_or(true))
    }

    /// Whether the supervisor should keep watching: false once this generation
    /// is no longer the active config.
    async fn respawn(
        &self,
        generation: u64,
        bin: &std::path::Path,
        conf: &std::path::Path,
    ) -> bool {
        if !self.is_current(generation) {
            return false;
        }
        match spawn_child(bin, conf) {
            Ok(mut child) => {
                let mut guard = self.child.lock().await;
                // Re-check under the lock: a `stop` between the check above and
                // here took a `None` child, so storing this one would leave it
                // tunnelling with nothing left holding a handle to kill it.
                if !self.is_current(generation) {
                    let _ = child.kill().await;
                    return false;
                }
                record_pid(&self.dir(), &child);
                *guard = Some(child);
                true
            }
            Err(e) => {
                tracing::warn!(error = %e, "wireguard bridge restart failed");
                true
            }
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use std::sync::atomic::Ordering;

    use crate::test_support::{eventually, install_script, vpn_for, EXITING, RUNNING};
    use kroma_module_sdk::host::testing::StubHost;
    use kroma_module_sdk::host::HostCtx;

    async fn pid_of(vpn: &crate::Vpn) -> Option<u32> {
        vpn.child.lock().await.as_ref().and_then(|c| c.id())
    }

    #[tokio::test]
    async fn child_died_is_none_without_a_child() {
        let host = StubHost::new();
        let vpn = vpn_for(&host);

        assert_eq!(vpn.child_died().await, None);
    }

    #[tokio::test]
    async fn child_died_reports_a_live_and_an_exited_child() {
        let host = StubHost::new();
        let vpn = vpn_for(&host);
        let live = install_script(host.data_dir(), RUNNING);
        *vpn.child.lock().await = Some(crate::process::spawn_child(&live, &live).unwrap());
        assert_eq!(vpn.child_died().await, Some(false));
        vpn.child.lock().await.take().unwrap().kill().await.unwrap();
        let gone = install_script(host.data_dir(), EXITING);
        *vpn.child.lock().await = Some(crate::process::spawn_child(&gone, &gone).unwrap());

        eventually(|| async { vpn.child_died().await == Some(true) }).await;
    }

    #[tokio::test]
    async fn respawn_refuses_a_stale_generation() {
        let host = StubHost::new();
        let vpn = vpn_for(&host);
        let bin = install_script(host.data_dir(), RUNNING);
        vpn.generation.store(2, Ordering::SeqCst);

        let keep_watching = vpn.respawn(1, &bin, &bin).await;

        assert!(!keep_watching);
        assert_eq!(pid_of(&vpn).await, None);
    }

    #[tokio::test]
    async fn respawn_stores_the_new_child_and_records_its_pid() {
        let host = StubHost::new();
        let vpn = vpn_for(&host);
        let bin = install_script(host.data_dir(), RUNNING);
        std::fs::create_dir_all(vpn.dir()).unwrap();

        let keep_watching = vpn.respawn(0, &bin, &bin).await;

        assert!(keep_watching);
        let pid = pid_of(&vpn).await.unwrap();
        let recorded = std::fs::read_to_string(vpn.dir().join("wireproxy.pid")).unwrap();
        assert_eq!(recorded, pid.to_string());
        vpn.child.lock().await.take().unwrap().kill().await.unwrap();
    }

    #[tokio::test]
    async fn respawn_keeps_watching_when_the_binary_fails_to_spawn() {
        let host = StubHost::new();
        let vpn = vpn_for(&host);
        let missing = host.data_dir().join("absent");

        let keep_watching = vpn.respawn(0, &missing, &missing).await;

        assert!(keep_watching);
        assert_eq!(pid_of(&vpn).await, None);
    }

    #[tokio::test]
    async fn the_supervisor_restarts_a_child_that_exited() {
        let host = StubHost::new();
        let vpn = vpn_for(&host);
        let bin = install_script(host.data_dir(), EXITING);
        std::fs::create_dir_all(vpn.dir()).unwrap();
        let first = crate::process::spawn_child(&bin, &bin).unwrap();
        let first_pid = first.id();
        *vpn.child.lock().await = Some(first);

        vpn.clone().supervise(0, bin.clone(), bin);

        eventually(|| async { pid_of(&vpn).await != first_pid }).await;
        vpn.generation.store(1, Ordering::SeqCst);
    }
}
