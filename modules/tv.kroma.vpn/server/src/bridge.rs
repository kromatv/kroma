use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use kroma_module_sdk::host::process::Child;
use kroma_module_sdk::host::run_blocking;

use crate::process::spawn_child;
use crate::socks_auth;
use crate::wireguard::ipv4_only_wg;

/// One `wireproxy` child carrying one WireGuard tunnel to a SOCKS5 port, and the
/// watcher that brings it back when it dies.
pub(crate) struct Bridge {
    pub(crate) dir: PathBuf,
    secret_dir: PathBuf,
    pub(crate) child: tokio::sync::Mutex<Option<Child>>,
    // Bumped on every (re)configure so a stale exit-waiter never respawns an
    // old generation.
    pub(crate) generation: AtomicU64,
}

fn wireproxy_conf(wg_path: &Path, port: u16, password: &str) -> String {
    format!(
        "WGConfig = {}\n\n[Socks5]\nBindAddress = 127.0.0.1:{port}\nUsername = {}\nPassword = {password}\n",
        wg_path.display(),
        socks_auth::USER,
    )
}

fn written_configs(
    dir: &Path,
    secret_dir: &Path,
    wg_config: &str,
    port: u16,
) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("create vpn dir: {e}"))?;
    let wg_path = dir.join("wg.conf");
    // Force the tunnel IPv4-only. wireproxy carries IPv4 BitTorrent peer
    // connections fine but STALLS IPv6 ones mid-handshake (Proton's IPv6
    // P2P path). Worse, an IPv6-capable tunnel makes the client announce to
    // trackers over IPv6, so the tracker returns IPv6 peers (which then
    // can't be reached) instead of the IPv4 peers wireproxy can use. See
    // `ipv4_only_wg`.
    write_private(&wg_path, &(ipv4_only_wg(wg_config.trim()) + "\n"))
        .map_err(|e| format!("write wg.conf: {e}"))?;
    let password =
        socks_auth::password(secret_dir).map_err(|e| format!("mint the SOCKS password: {e}"))?;
    let conf_path = dir.join("wireproxy.conf");
    write_private(&conf_path, &wireproxy_conf(&wg_path, port, &password))
        .map_err(|e| format!("write wireproxy.conf: {e}"))?;
    Ok(conf_path)
}

pub(crate) fn write_private(path: &Path, contents: &str) -> std::io::Result<()> {
    std::fs::write(path, contents)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

impl Bridge {
    /// A bridge writing its files under `dir`, behind the SOCKS password kept in
    /// `secret_dir`.
    pub(crate) fn new(dir: PathBuf, secret_dir: PathBuf) -> Arc<Self> {
        Arc::new(Self {
            dir,
            secret_dir,
            child: tokio::sync::Mutex::new(None),
            generation: AtomicU64::new(0),
        })
    }

    /// Kill the child and stand its watcher down. Answers the generation a
    /// [`Self::launch`] that follows must carry.
    pub(crate) async fn retire(&self) -> u64 {
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        if let Some(old) = self.child.lock().await.take() {
            old.kill();
        }
        generation
    }

    /// Write the tunnel's files and start the child, unless a later
    /// [`Self::retire`] made `generation` stale meanwhile.
    pub(crate) async fn launch(
        self: &Arc<Self>,
        generation: u64,
        bin: String,
        wg_config: String,
        port: u16,
    ) -> Result<(), String> {
        let dir = self.dir.clone();
        let secret_dir = self.secret_dir.clone();
        let conf_path = run_blocking(move || written_configs(&dir, &secret_dir, &wg_config, port))
            .await
            .map_err(|e| e.to_string())??;

        let child = spawn_child(&bin, &conf_path)?;
        {
            let mut guard = self.child.lock().await;
            if !self.is_current(generation) {
                child.kill();
                return Ok(());
            }
            *guard = Some(child);
        }
        tracing::info!(port, "wireguard bridge started (wireproxy)");

        self.clone().supervise(generation, bin, conf_path);
        Ok(())
    }

    pub(crate) fn is_current(&self, generation: u64) -> bool {
        self.generation.load(Ordering::SeqCst) == generation
    }

    /// Whether the child is currently alive.
    pub(crate) async fn running(&self) -> bool {
        let guard = self.child.lock().await;
        match guard.as_ref() {
            Some(child) => child.try_wait().map(|s| s.is_none()).unwrap_or(false),
            None => false,
        }
    }
}
