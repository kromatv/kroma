//! The download manager: the embedded torrent engine's lifecycle, the grab
//! ledger and the kill-switch gate. Everything here is blocking.

pub mod monitor;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use anyhow::{anyhow, Result};
use crate::{ClientDef, DownloadClient, RqbitEngine};

use crate::db::{self, DownloadClientRow, DownloadRow};

use crate::VpnStatusView;
use kroma_module_sdk::db::Pool;
use kroma_module_sdk::host::HostCtx;
use kroma_module_sdk::primitives::now_ms;

mod engine;
mod fetch;
mod gate;
mod grab;
mod ledger;

pub use gate::active_proxy_url;

use fetch::fetch_torrent_file;

pub const LABEL: &str = "kroma";

pub struct DownloadManager {
    rqbit: RwLock<Option<Arc<RqbitEngine>>>,
    gate_open: AtomicBool,
    vpn_fail_streak: AtomicU32,
    vpn_status: Mutex<Option<VpnStatusView>>,
    paused_by_killswitch: Mutex<Vec<String>>,
    paused_by_disable: Mutex<Vec<String>>,
    state_dir: PathBuf,
    downloads_dir: PathBuf,
    clients: RwLock<crate::DownloadClientRegistry>,
    monitor_started: AtomicBool,
    // The manager holds its own pools rather than taking them off a host,
    // because the port contracts it implements name only `HostCtx`: a consumer
    // must be able to compile against a contract without holding the provider's
    // capabilities. `core` is the shared ledger (`downloads`, scoped by this
    // module's grant); `store` is this module's own file, where the client
    // configs and their passwords live.
    core: Pool,
    store: Pool,
}

impl DownloadManager {
    pub fn new(data_dir: &std::path::Path, core: Pool, store: Pool) -> Arc<Self> {
        let state_dir = data_dir.join("torrents");
        std::fs::create_dir_all(&state_dir).ok();
        Arc::new(Self {
            rqbit: RwLock::new(None),
            gate_open: AtomicBool::new(true),
            vpn_fail_streak: AtomicU32::new(0),
            vpn_status: Mutex::new(None),
            paused_by_killswitch: Mutex::new(Vec::new()),
            paused_by_disable: Mutex::new(Vec::new()),
            downloads_dir: state_dir.join("downloads"),
            state_dir,
            clients: RwLock::new(crate::builtin_download_clients()),
            monitor_started: AtomicBool::new(false),
            core,
            store,
        })
    }

    /// The shared ledger this module writes its `downloads` rows into.
    pub fn core(&self) -> &Pool {
        &self.core
    }

    /// This module's own database: the download clients and their credentials.
    pub fn store(&self) -> &Pool {
        &self.store
    }

    /// Idempotent; a no-op when the embedded engine is not compiled in.
    pub fn seed_embedded_client(&self) {
        if !crate::RQBIT_COMPILED {
            return;
        }
        let _ = db::insert_download_client(
            self.store(),
            &DownloadClientRow {
                id: db::EMBEDDED_CLIENT_ID.to_string(),
                kind: "rqbit".into(),
                name: "Moteur intégré".into(),
                url: String::new(),
                username: String::new(),
                password: String::new(),
                enabled: true,
                priority: 100,
                created_at: now_ms(),
            },
        );
    }

    /// At most once per process; the loop self-idles while the module is off.
    pub fn ensure_monitor(self: &Arc<Self>, host: Arc<dyn HostCtx>) {
        if self.monitor_started.swap(true, Ordering::SeqCst) {
            return;
        }
        self.spawn_monitor(host);
    }

    /// Metadata only, no download: the admin selects files before grabbing.
    pub fn list_files(&self, _host: &dyn HostCtx, magnet_or_url: &str) -> Result<Vec<crate::TorrentFileEntry>> {
        let conn = self.store().get()?;
        let client = db::preferred_download_client(&conn)?
            .ok_or_else(|| anyhow!("no enabled download client"))?;
        drop(conn);
        // Direct, bypassing the VPN: a LAN indexer is unreachable via the tunnel.
        let prefetched: Option<Vec<u8>> = (client.kind == "rqbit"
            && magnet_or_url.starts_with("http"))
        .then(|| fetch_torrent_file(magnet_or_url))
        .transpose()?;
        self.engine_for(&client)?.list_files(magnet_or_url, prefetched.as_deref())
    }

    pub fn engine_for(&self, row: &DownloadClientRow) -> Result<Box<dyn DownloadClient>> {
        let def = ClientDef {
            kind: row.kind.clone(),
            url: row.url.clone(),
            username: row.username.clone(),
            password: row.password.clone(),
        };
        self.clients.read().expect("download client registry lock").build(
            &def,
            &crate::DownloadClientCtx {
                rqbit: self.rqbit().map(|e| e as std::sync::Arc<dyn std::any::Any + Send + Sync>),
                state_dir: &self.state_dir,
            },
        )
    }
}

pub use kroma_module_sdk::ports::GrabSpec;

impl kroma_module_sdk::ports::DownloadClientHost for DownloadManager {
    fn register_engine(&self, register: fn(&mut crate::DownloadClientRegistry)) {
        let mut reg = self.clients.write().expect("download client registry lock");
        register(&mut reg);
    }

    fn unregister_engine(&self, kind: &str) {
        self.clients.write().expect("download client registry lock").unregister(kind);
    }
}

#[kroma_module_sdk::host::async_trait]
impl kroma_module_sdk::ports::DownloadVpnPort for DownloadManager {
    fn vpn_status(&self) -> Option<kroma_module_sdk::ports::VpnStatusView> {
        self.vpn_status()
    }

    fn vpn_seal_check(&self, host: &dyn HostCtx) -> Option<kroma_module_sdk::ports::VpnSeal> {
        self.vpn_check(host).map(|c| kroma_module_sdk::ports::VpnSeal {
            sealed: c.sealed(),
            proxied_ip: c.proxied_ip,
            direct_ip: c.direct_ip,
            error: c.error,
        })
    }

    async fn restart_engine(&self, host: &dyn HostCtx) {
        self.start_rqbit(host).await;
    }
}

impl kroma_module_sdk::ports::DownloadGrabPort for DownloadManager {
    fn grab(&self, host: &dyn HostCtx, spec: GrabSpec) -> Result<DownloadRow> {
        DownloadManager::grab(self, host, spec)
    }
    fn list_files(
        &self,
        host: &dyn HostCtx,
        magnet_or_url: &str,
    ) -> Result<Vec<crate::TorrentFileEntry>> {
        DownloadManager::list_files(self, host, magnet_or_url)
    }
    fn gate_open(&self) -> bool {
        DownloadManager::gate_open(self)
    }
    fn activate(&self, host: &dyn HostCtx, row: &DownloadRow) {
        DownloadManager::activate(self, host, row);
    }
    fn drop_data(&self, host: &dyn HostCtx, row: &DownloadRow) {
        DownloadManager::drop_data(self, host, row);
    }
}

/// The `download-db` provider: the ledger reads the import pass makes over the
/// port bridge. Holds the pool for the same reason [`DownloadManager`] does -
/// the contract names only `HostCtx`, so the database cannot arrive through it.
pub struct DownloadDb(Pool);

impl DownloadDb {
    pub fn new(core: Pool) -> Self {
        Self(core)
    }
}

impl kroma_module_sdk::ports::DownloadDbPort for DownloadDb {
    fn completed_downloads(&self, _host: &dyn HostCtx) -> Result<Vec<DownloadRow>> {
        let conn = self.0.get()?;
        Ok(db::completed_downloads(&conn)?)
    }
    fn mark_download_imported(
        &self,
        _host: &dyn HostCtx,
        id: &str,
        paths: &[String],
        now_ms: i64,
    ) -> Result<()> {
        db::mark_download_imported(&self.0, id, paths, now_ms)
    }
    fn set_download_status(
        &self,
        _host: &dyn HostCtx,
        id: &str,
        status: &str,
        error: Option<&str>,
    ) -> Result<bool> {
        db::set_download_status(&self.0, id, status, error)
    }
}
