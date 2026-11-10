use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use kroma_module_sdk::host::HostCtx;

use crate::bridge::Bridge;
use crate::provision;
use crate::routed::{retire_routed, Routed};

pub struct Vpn {
    pub(crate) data_dir: PathBuf,
    pub(crate) main: Arc<Bridge>,
    pub(crate) routed: tokio::sync::Mutex<BTreeMap<String, Routed>>,
    // Latched by `stop` so an `apply` racing the shutdown - a `PUT /vpn` still
    // draining while the process exits - can't bring the bridge back up.
    pub(crate) stopping: AtomicBool,
    exit: std::sync::Mutex<Option<String>>,
}

pub(crate) fn base_port(host: &dyn HostCtx) -> u16 {
    host.setting_i64("vpnLocalPort", 25345).clamp(1, 65535) as u16
}

impl Vpn {
    pub fn new(data_dir: PathBuf) -> Arc<Self> {
        let dir = data_dir.join("vpn");
        Arc::new(Self {
            main: Bridge::new(dir.clone(), dir),
            data_dir,
            routed: tokio::sync::Mutex::new(BTreeMap::new()),
            stopping: AtomicBool::new(false),
            exit: std::sync::Mutex::new(None),
        })
    }

    pub(crate) fn dir(&self) -> PathBuf {
        self.data_dir.join("vpn")
    }

    /// (Re)apply the stored config: start / restart / stop the bridge child,
    /// then the tunnels the router sends calls through by name. Call at boot
    /// and whenever `vpnWgConfig`, `vpnLocalPort` or a kept config's place in
    /// the router change.
    pub async fn apply(self: &Arc<Self>, host: &dyn HostCtx) {
        let generation = self.main.retire().await;
        let wg = host.setting_str("vpnWgConfig", "");
        if !wg.trim().is_empty() && !self.stopping.load(Ordering::SeqCst) {
            let port = base_port(host);
            let started = match provision::ensure(&self.data_dir).await {
                Ok(bin) => self.main.launch(generation, bin, wg, port).await,
                Err(e) => Err(e),
            };
            if let Err(e) = started {
                tracing::warn!(error = %e, "wireguard bridge failed to start");
            }
        }
        self.apply_routed(host).await;
    }

    /// Take every bridge down for good: latch respawns off and kill the
    /// children. Idempotent, and awaited by the caller that matters: the module
    /// being disabled or stopped, so nothing is left tunnelling.
    /// [`Self::resume`] undoes the latch on re-enable.
    pub async fn stop(self: &Arc<Self>) {
        self.stopping.store(true, Ordering::SeqCst);
        self.main.retire().await;
        let routed = std::mem::take(&mut *self.routed.lock().await);
        for held in routed.into_values() {
            retire_routed(held).await;
        }
        tracing::info!("wireguard bridge shut down");
    }

    /// Keep the exit address the download engine last reported, so offering the
    /// network never has to ask the engine, which may be asking for the network.
    pub fn remember_exit(&self, exit: Option<String>) {
        *self
            .exit
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = exit;
    }

    /// The exit address the download engine last reported.
    pub fn last_exit(&self) -> Option<String> {
        self.exit
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    /// Clear a previous [`Self::stop`] so `apply` may start the bridge again.
    pub fn resume(&self) {
        self.stopping.store(false, Ordering::SeqCst);
    }

    /// Whether the default bridge child is currently alive.
    pub async fn running(&self) -> bool {
        self.main.running().await
    }
}

#[cfg(all(test, unix))]
mod tests {
    use std::os::unix::fs::PermissionsExt;

    use crate::test_support::{configured_host, eventually, install_script, vpn_for, RUNNING};
    use kroma_module_sdk::host::testing::StubHost;
    use kroma_module_sdk::host::HostCtx;

    #[tokio::test]
    async fn apply_without_a_config_starts_nothing() {
        let host = StubHost::new();
        let vpn = vpn_for(&host);

        vpn.apply(&host).await;

        assert!(!vpn.running().await);
    }

    #[tokio::test]
    async fn apply_with_a_config_writes_both_files_and_starts_the_bridge() {
        let host = configured_host();
        install_script(host.data_dir(), RUNNING);
        let vpn = vpn_for(&host);

        vpn.apply(&host).await;

        assert!(vpn.running().await);
        let wg = std::fs::read_to_string(vpn.dir().join("wg.conf")).unwrap();
        assert!(!wg.contains("2a07:b944"));
        let proxy = std::fs::read_to_string(vpn.dir().join("wireproxy.conf")).unwrap();
        assert!(proxy.contains("BindAddress = 127.0.0.1:25999"));
        assert!(proxy.contains("\nUsername = kroma\n"), "{proxy}");
        assert!(proxy.contains("\nPassword = "), "{proxy}");
        vpn.stop().await;
    }

    #[tokio::test]
    async fn applying_again_replaces_the_running_child() {
        let host = configured_host();
        install_script(host.data_dir(), RUNNING);
        let vpn = vpn_for(&host);
        vpn.apply(&host).await;
        let first = vpn.main.child.lock().await.as_ref().map(|c| c.id());

        vpn.apply(&host).await;

        let second = vpn.main.child.lock().await.as_ref().map(|c| c.id());
        assert_ne!(first, second);
        assert!(vpn.running().await);
        vpn.stop().await;
    }

    #[tokio::test]
    async fn stop_kills_the_child_and_latches_apply_off_until_resume() {
        let host = configured_host();
        install_script(host.data_dir(), RUNNING);
        let vpn = vpn_for(&host);
        vpn.apply(&host).await;

        vpn.stop().await;
        vpn.apply(&host).await;

        assert!(!vpn.running().await);
        vpn.resume();
        vpn.apply(&host).await;
        eventually(|| async { vpn.running().await }).await;
        vpn.stop().await;
    }

    #[tokio::test]
    async fn apply_survives_a_binary_that_cannot_spawn() {
        let host = configured_host();
        let path = install_script(host.data_dir(), RUNNING);
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        let vpn = vpn_for(&host);

        vpn.apply(&host).await;

        assert!(path.exists());
        assert!(!vpn.running().await);
    }
}
