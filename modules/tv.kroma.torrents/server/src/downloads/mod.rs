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
    // Held rather than threaded through: `engine_for` is called from the monitor
    // loop and from lifecycle methods with no host in scope, and every engine but
    // the embedded one is another process this has to resolve.
    host: Arc<dyn HostCtx>,
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
    pub fn new(
        host: Arc<dyn HostCtx>,
        data_dir: &std::path::Path,
        core: Pool,
        store: Pool,
    ) -> Arc<Self> {
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
            host,
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

    /// The engine for one configured client. The embedded one is in this process;
    /// every other kind is a module answering the `download-client` point under
    /// that kind, so a client this module has never heard of works as soon as
    /// something is installed to answer for it.
    pub fn engine_for(&self, row: &DownloadClientRow) -> Result<Box<dyn DownloadClient>> {
        let def = ClientDef {
            kind: row.kind.clone(),
            url: row.url.clone(),
            username: row.username.clone(),
            password: row.password.clone(),
        };
        if def.kind == crate::engine::EMBEDDED_KIND {
            // Both reasons are actionable, and they are different problems: one
            // needs the engine started, the other a build that has it.
            let engine = self.rqbit().ok_or_else(|| {
                if crate::RQBIT_COMPILED {
                    anyhow!("embedded engine not started")
                } else {
                    anyhow!("the embedded engine is not compiled into this build")
                }
            })?;
            return Ok(engine.client());
        }
        crate::engine::remote::RemoteEngine::new(&*self.host, def)
            .map(|e| Box::new(e) as Box<dyn DownloadClient>)
            .ok_or_else(|| anyhow!("no module provides the {:?} download client", row.kind))
    }
}

/// Everything needed to grab a torrent + import it. Built from a scored release
/// (auto / interactive) or from admin-provided fields (manual add / magnet).
/// `upgrade` means the grab replaces media already on disk, so the import takes
/// the destination and clears what it superseded instead of landing beside it.
///
/// Tolerant, because it arrives over the `download-grab` point from a separately
/// released module: a field that consumer does not send has to default, or an
/// older peer's spec would be a 422 rather than a grab.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct GrabSpec {
    pub magnet_or_url: String,
    pub kind: String,
    pub tmdb_id: u64,
    pub title: Option<String>,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episodes: Option<Vec<u32>>,
    pub release_title: String,
    pub indexer_id: Option<String>,
    pub size_bytes: Option<u64>,
    pub score: Option<i32>,
    pub score_breakdown: Option<String>,
    pub request_id: Option<String>,
    pub wanted_ids: Vec<String>,
    pub only_files: Option<Vec<usize>>,
    pub details_url: Option<String>,
    #[serde(default)]
    pub upgrade: bool,
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

impl DownloadDb {
    /// One row by id, or `None` when nothing has it.
    pub fn get(&self, id: &str) -> Result<Option<DownloadRow>> {
        let conn = self.0.get()?;
        Ok(db::get_download(&conn, id)?)
    }

    /// Rows the engine finished but nothing has imported yet.
    pub fn completed(&self) -> Result<Vec<DownloadRow>> {
        let conn = self.0.get()?;
        Ok(db::completed_downloads(&conn)?)
    }

    /// Record where an import landed a row's files.
    pub fn mark_imported(&self, id: &str, paths: &[String], now_ms: i64) -> Result<()> {
        db::mark_download_imported(&self.0, id, paths, now_ms)
    }

    /// Move a row to `status`, with the reason when it failed. `false` when no row
    /// has that id.
    pub fn set_status(&self, id: &str, status: &str, error: Option<&str>) -> Result<bool> {
        db::set_download_status(&self.0, id, status, error)
    }
}
