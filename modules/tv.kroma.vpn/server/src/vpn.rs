use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use kroma_module_sdk::host::process::Child;
use kroma_module_sdk::host::HostCtx;

use crate::process::spawn_child;
use crate::provision;
use crate::socks_auth;
use crate::wireguard::ipv4_only_wg;

pub struct Vpn {
    pub(crate) data_dir: PathBuf,
    pub(crate) child: tokio::sync::Mutex<Option<Child>>,
    // Bumped on every (re)configure so a stale exit-waiter never respawns an
    // old generation.
    pub(crate) generation: AtomicU64,
    // Latched by `stop` so an `apply` racing the shutdown - a `PUT /vpn` still
    // draining while the process exits - can't bring the bridge back up.
    stopping: AtomicBool,
    exit: std::sync::Mutex<Option<String>>,
}

fn wireproxy_conf(wg_path: &std::path::Path, port: u16, password: &str) -> String {
    format!(
        "WGConfig = {}\n\n[Socks5]\nBindAddress = 127.0.0.1:{port}\nUsername = {}\nPassword = {password}\n",
        wg_path.display(),
        socks_auth::USER,
    )
}

impl Vpn {
    pub fn new(data_dir: PathBuf) -> Arc<Self> {
        Arc::new(Self {
            data_dir,
            child: tokio::sync::Mutex::new(None),
            generation: AtomicU64::new(0),
            stopping: AtomicBool::new(false),
            exit: std::sync::Mutex::new(None),
        })
    }

    pub(crate) fn dir(&self) -> PathBuf {
        self.data_dir.join("vpn")
    }

    /// (Re)apply the stored config: start / restart / stop the bridge child.
    /// Call at boot and whenever `vpnWgConfig` / `vpnLocalPort` change.
    pub async fn apply(self: &Arc<Self>, host: &dyn HostCtx) {
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        if let Some(old) = self.child.lock().await.take() {
            old.kill();
        }
        let wg = host.setting_str("vpnWgConfig", "");
        if wg.trim().is_empty() || self.stopping.load(Ordering::SeqCst) {
            return;
        }
        let port = host.setting_i64("vpnLocalPort", 25345).clamp(1, 65535);
        if let Err(e) = self.clone().start_bridge(generation, wg, port as u16).await {
            tracing::warn!(error = %e, "wireguard bridge failed to start");
        }
    }

    /// Take the bridge down for good: latch respawns off and kill the child.
    /// Idempotent, and awaited by the caller that matters: the module being
    /// disabled or stopped, so nothing is left tunnelling. [`Self::resume`]
    /// undoes the latch on re-enable.
    pub async fn stop(self: &Arc<Self>) {
        self.stopping.store(true, Ordering::SeqCst);
        self.generation.fetch_add(1, Ordering::SeqCst);
        if let Some(old) = self.child.lock().await.take() {
            old.kill();
        }
        tracing::info!("wireguard bridge shut down");
    }

    /// Keep the exit address the download engine last reported, so offering the
    /// network never has to ask the engine, which may be asking for the network.
    pub fn remember_exit(&self, exit: Option<String>) {
        *self.exit.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = exit;
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

    async fn start_bridge(
        self: Arc<Self>,
        generation: u64,
        wg_config: String,
        port: u16,
    ) -> Result<(), String> {
        let bin = provision::ensure(&self.data_dir).await?;
        let dir = self.dir();
        std::fs::create_dir_all(&dir).map_err(|e| format!("create vpn dir: {e}"))?;
        let wg_path = dir.join("wg.conf");
        // Force the tunnel IPv4-only. wireproxy carries IPv4 BitTorrent peer
        // connections fine but STALLS IPv6 ones mid-handshake (Proton's IPv6
        // P2P path). Worse, an IPv6-capable tunnel makes the client announce to
        // trackers over IPv6, so the tracker returns IPv6 peers (which then
        // can't be reached) instead of the IPv4 peers wireproxy can use. See
        // `ipv4_only_wg`.
        std::fs::write(&wg_path, ipv4_only_wg(wg_config.trim()) + "\n")
            .map_err(|e| format!("write wg.conf: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&wg_path, std::fs::Permissions::from_mode(0o600));
        }
        let password =
            socks_auth::password(&dir).map_err(|e| format!("mint the SOCKS password: {e}"))?;
        let conf_path = dir.join("wireproxy.conf");
        std::fs::write(&conf_path, wireproxy_conf(&wg_path, port, &password))
            .map_err(|e| format!("write wireproxy.conf: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&conf_path, std::fs::Permissions::from_mode(0o600));
        }

        let child = spawn_child(&bin, &conf_path)?;
        tracing::info!(port, "wireguard bridge started (wireproxy)");
        *self.child.lock().await = Some(child);

        self.clone().supervise(generation, bin, conf_path);
        Ok(())
    }

    /// Whether the bridge child is currently alive.
    pub async fn running(&self) -> bool {
        let guard = self.child.lock().await;
        match guard.as_ref() {
            Some(child) => child.try_wait().map(|s| s.is_none()).unwrap_or(false),
            None => false,
        }
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
        let first = vpn.child.lock().await.as_ref().map(|c| c.id());

        vpn.apply(&host).await;

        let second = vpn.child.lock().await.as_ref().map(|c| c.id());
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
