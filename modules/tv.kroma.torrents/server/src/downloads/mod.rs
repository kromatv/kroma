//! The download manager: the embedded torrent engine's lifecycle, the grab
//! ledger and the kill-switch gate. Everything here is blocking.

pub mod monitor;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use anyhow::{anyhow, bail, Result};
use crate::{AddTorrentReq, ClientDef, DownloadClient, RqbitConfig, RqbitEngine};

use crate::db::{self, DownloadClientRow, DownloadRow};
use kroma_module_sdk::domain::RequestStatus;

use crate::VpnStatusView;
use kroma_module_sdk::host::{Event, HostCtx};
use serde_json::json;
use kroma_module_sdk::primitives::now_ms;

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
}

const VPN_FAIL_GRACE: u32 = 2;

impl DownloadManager {
    pub fn new(data_dir: &std::path::Path) -> Arc<Self> {
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
        })
    }

    /// Idempotent; a no-op when the embedded engine is not compiled in.
    pub fn seed_embedded_client(&self, host: &dyn HostCtx) {
        if !crate::RQBIT_COMPILED {
            return;
        }
        let _ = db::insert_download_client(
            host.db(),
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

    /// Errors are logged, not fatal. The new session starts before the old one
    /// stops, so a failed restart leaves the previous engine running.
    pub async fn start_rqbit(&self, host: &dyn HostCtx) {
        // Never bring the engine up while the embedded client is disabled; a
        // missing row means first boot before seeding, treated as enabled.
        if let Ok(conn) = host.db().get() {
            if let Ok(Some(c)) = db::get_download_client(&conn, db::EMBEDDED_CLIENT_ID) {
                if !c.enabled {
                    drop(conn);
                    self.stop_rqbit();
                    return;
                }
            }
        }
        // A missing proxy can also mean the VPN sidecar has not answered yet.
        // Peer traffic must stay sealed, so defer the start (the monitor
        // retries) rather than run on the raw connection.
        let proxy = active_proxy_url(host);
        if proxy.is_none() && vpn_sealed_expected(host) {
            tracing::warn!(
                "VPN is configured but its proxy is not resolvable; embedded engine start deferred (never runs unsealed)"
            );
            return;
        }
        let cfg = RqbitConfig {
            session_dir: self.state_dir.join("session"),
            download_dir: self.downloads_dir.clone(),
            socks_proxy_url: proxy,
            listen_port: u16::try_from(host.setting_i64("rqbitPort", 0).max(0)).ok(),
            download_bps: kbps_setting(host, "rqbitDownKbps"),
            upload_bps: kbps_setting(host, "rqbitUpKbps"),
        };
        match RqbitEngine::start(&cfg).await {
            Ok(engine) => {
                tracing::info!(proxy = cfg.socks_proxy_url.is_some(), "embedded torrent engine started");
                let old = self.rqbit.write().unwrap().replace(engine);
                if let Some(old) = old {
                    old.stop();
                }
            }
            Err(e) => {
                tracing::warn!(error = %format!("{e:#}"), "embedded torrent engine restart failed; keeping the previous session");
            }
        }
    }

    pub fn rqbit(&self) -> Option<Arc<RqbitEngine>> {
        self.rqbit.read().unwrap().clone()
    }

    /// Per download id: down/up bps, peers, peers seen. Blocking.
    pub fn live_stats(&self, host: &dyn HostCtx) -> std::collections::HashMap<String, (u64, u64, u32, u32)> {
        let mut out = std::collections::HashMap::new();
        let Ok(rows) = host.db().get().and_then(|c| Ok(db::active_downloads(&c)?)) else {
            return out;
        };
        for row in rows {
            if row.client_ref.is_empty() {
                continue;
            }
            let client = match host.db().get().and_then(|c| Ok(db::get_download_client(&c, &row.client_id)?)) {
                Ok(Some(c)) => c,
                _ => continue,
            };
            if let Ok(engine) = self.engine_for(&client) {
                if let Ok(Some(s)) = engine.status(&row.client_ref) {
                    out.insert(row.id, (s.down_bps, s.up_bps, s.peers, s.peers_seen));
                }
            }
        }
        out
    }

    /// Announce through the proxy ourselves (curl) and inject the peers, for
    /// torrents stuck at 0 peers: librqbit dials trackers via reqwest, whose
    /// SOCKS support cannot traverse the WireGuard-to-SOCKS bridge. Blocking.
    #[cfg(feature = "rqbit")]
    pub fn reseed_stalled(&self, host: &dyn HostCtx) {
        // No proxy => librqbit's own (direct) announce works; nothing to do.
        let Some(proxy) = active_proxy_url(host) else { return };
        let Some(engine) = self.rqbit() else { return };
        let client = engine.client();
        let session_dir = self.state_dir.join("session");
        let rows = match host.db().get().and_then(|c| Ok(db::active_downloads(&c)?)) {
            Ok(rows) => rows,
            Err(_) => return,
        };
        for row in rows {
            if row.client_id != db::EMBEDDED_CLIENT_ID || row.client_ref.is_empty() {
                continue;
            }
            let Ok(Some(status)) = client.status(&row.client_ref) else { continue };
            // A reseed is a remove/re-add, which RESETS the torrent to 0%, so
            // only touch a grab with no progress, no peer and none ever seen.
            if status.progress > 0.0 || status.peers > 0 || status.peers_seen > 0 {
                continue;
            }
            // librqbit persists `<info_hash>.torrent`; client_ref is that hex.
            let path = session_dir.join(format!("{}.torrent", row.client_ref));
            let Ok(bytes) = std::fs::read(&path) else { continue };
            let peers = crate::announce::tracker_peers(&bytes, Some(&proxy));
            if peers.is_empty() {
                continue;
            }
            match engine.reseed(&row.client_ref, bytes, row.save_path.as_deref(), &peers) {
                Ok(()) => tracing::info!(
                    id = %row.id,
                    peers = peers.len(),
                    "re-seeded a stalled torrent with peers from our proxied tracker announce"
                ),
                Err(e) => {
                    tracing::warn!(id = %row.id, error = %format!("{e:#}"), "torrent re-seed failed")
                }
            }
        }
    }

    /// Transmission and qBittorrent announce for themselves.
    #[cfg(not(feature = "rqbit"))]
    pub fn reseed_stalled(&self, _host: &dyn HostCtx) {}

    /// Metadata only, no download: the admin selects files before grabbing.
    pub fn list_files(&self, host: &dyn HostCtx, magnet_or_url: &str) -> Result<Vec<crate::TorrentFileEntry>> {
        let conn = host.db().get()?;
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

    pub fn gate_open(&self) -> bool {
        self.gate_open.load(Ordering::Relaxed)
    }

    pub fn vpn_status(&self) -> Option<VpnStatusView> {
        self.vpn_status.lock().unwrap().clone()
    }

    /// One probe + gate transition; no proxy configured = dormant. Blocking.
    pub fn vpn_check(&self, host: &dyn HostCtx) -> Option<crate::proxycheck::VpnCheck> {
        let Some(proxy) = active_proxy_url(host) else {
            self.gate_open.store(true, Ordering::Relaxed);
            *self.vpn_status.lock().unwrap() = None;
            return None;
        };
        let check_url = host.setting_str("vpnCheckUrl", "https://api.ipify.org");
        let check = crate::proxycheck::check(&proxy, &check_url);
        let sealed = check.sealed();
        let kill_switch = host.setting_bool("vpnKillSwitch", false);
        let was_open = self.gate_open.load(Ordering::Relaxed);

        // One blip must not block downloads; only a sustained failure does.
        let streak = if sealed {
            self.vpn_fail_streak.store(0, Ordering::Relaxed);
            0
        } else {
            self.vpn_fail_streak.fetch_add(1, Ordering::Relaxed) + 1
        };

        if kill_switch && !sealed && streak >= VPN_FAIL_GRACE && was_open {
            self.close_gate(host);
        } else if (!kill_switch || sealed) && !was_open {
            self.open_gate(host);
        }
        let paused = !self.gate_open.load(Ordering::Relaxed);
        let status = VpnStatusView { connected: sealed, exit_ip: check.proxied_ip.clone(), paused };
        let changed = self.vpn_status.lock().unwrap().replace(status.clone()) != Some(status.clone());
        if changed {
            host.publish(Event::new(
                "vpn.status",
                json!({
                    "connected": status.connected,
                    "exitIp": status.exit_ip,
                    "paused": status.paused,
                }),
            ));
        }
        Some(check)
    }

    fn close_gate(&self, host: &dyn HostCtx) {
        self.gate_open.store(false, Ordering::Relaxed);
        tracing::warn!("VPN kill switch engaged: pausing embedded downloads");
        let mut held: Vec<String> = Vec::new();
        if let Ok(conn) = host.db().get() {
            if let Ok(rows) = db::active_downloads(&conn) {
                drop(conn);
                for row in rows {
                    if row.client_id != db::EMBEDDED_CLIENT_ID || row.status == "paused" {
                        continue;
                    }
                    if self.pause(host, &row.id).is_ok() {
                        held.push(row.id);
                    }
                }
            }
        }
        *self.paused_by_killswitch.lock().unwrap() = held;
    }

    fn open_gate(&self, host: &dyn HostCtx) {
        self.gate_open.store(true, Ordering::Relaxed);
        let held = std::mem::take(&mut *self.paused_by_killswitch.lock().unwrap());
        if !held.is_empty() {
            tracing::info!(count = held.len(), "VPN restored: resuming held downloads");
        }
        for id in held {
            let _ = self.resume(host, &id);
        }
    }

    /// Drops the session: no download, no seed, no DHT. Idempotent.
    pub fn stop_rqbit(&self) {
        if let Some(engine) = self.rqbit.write().unwrap().take() {
            engine.stop();
            tracing::info!("embedded torrent engine stopped");
        }
    }

    /// `start_rqbit` refuses to come back up until re-enabled, so this survives
    /// restarts.
    pub fn disable_embedded(&self, host: &dyn HostCtx) {
        let mut held = Vec::new();
        if let Ok(conn) = host.db().get() {
            if let Ok(rows) = db::active_downloads(&conn) {
                drop(conn);
                for row in rows {
                    if row.client_id == db::EMBEDDED_CLIENT_ID && row.status != "paused" {
                        let _ = db::set_download_status(host.db(), &row.id, "paused", None);
                        held.push(row.id);
                    }
                }
            }
        }
        *self.paused_by_disable.lock().unwrap() = held;
        self.stop_rqbit();
        tracing::warn!("embedded engine disabled: session stopped, downloads paused");
    }

    /// The caller must have restarted the session first.
    pub fn resume_after_enable(&self, host: &dyn HostCtx) {
        let held = std::mem::take(&mut *self.paused_by_disable.lock().unwrap());
        for id in held {
            let _ = db::set_download_status(host.db(), &id, "downloading", None);
        }
    }

    /// Does NO torrent network I/O: the row lands `queued` and the caller runs
    /// [`Self::activate`] in the background to hand it to the engine.
    pub fn grab(&self, host: &dyn HostCtx, spec: GrabSpec) -> Result<DownloadRow> {
        if !self.gate_open() {
            bail!("downloads are held by the VPN kill switch");
        }
        if spec.magnet_or_url.trim().is_empty() {
            bail!("no magnet or download link");
        }
        let conn = host.db().get()?;
        if let Some(existing) = db::active_download_by_url(&conn, spec.magnet_or_url.trim())? {
            bail!("this release is already in the queue (\"{}\", status: {})", existing.title.as_deref().unwrap_or(&existing.release_title), existing.status);
        }
        let client = db::preferred_download_client(&conn)?
            .ok_or_else(|| anyhow!("no enabled download client"))?;
        drop(conn);

        let id = kroma_module_sdk::primitives::short_hash(&format!(
            "download|{}|{}",
            spec.release_title,
            kroma_module_sdk::primitives::random_token()
        ));
        // External engines use their own directory and report it via status().
        let save_path = (client.kind == "rqbit")
            .then(|| self.downloads_dir.join(&id).to_string_lossy().into_owned());

        let row = DownloadRow {
            id,
            client_id: client.id.clone(),
            client_ref: String::new(), // filled in by activate() once added
            request_id: spec.request_id.clone(),
            kind: spec.kind,
            tmdb_id: spec.tmdb_id,
            title: spec.title,
            year: spec.year,
            season: spec.season,
            episodes: spec.episodes,
            release_title: spec.release_title,
            indexer_id: spec.indexer_id,
            info_hash: None,
            magnet_or_url: spec.magnet_or_url,
            size_bytes: spec.size_bytes,
            score: spec.score,
            score_breakdown: spec.score_breakdown,
            status: "queued".into(),
            progress: 0.0,
            save_path,
            imported_paths: None,
            error: None,
            grabbed_at: now_ms(),
            completed_at: None,
            imported_at: None,
            details_url: spec.details_url,
            only_files: spec.only_files,
            upgrade: spec.upgrade,
        };
        db::insert_download(host.db(), &row)?;
        db::set_wanted_status(host.db(), &spec.wanted_ids, "grabbed", now_ms())?;
        if let Some(req_id) = &row.request_id {
            // Deliberately not persisted: `downloading` is derived at read time
            // from the live download, so it self-heals if the grab fails.
            host.publish(Event::new(
                "request.updated",
                json!({ "id": req_id, "status": RequestStatus::Downloading.as_str() }),
            ));
        }
        tracing::info!(release = %row.release_title, client = %client.name, "queued torrent grab");
        Ok(row)
    }

    /// Background phase of a grab: slow (up to a couple of minutes), and safe
    /// to run detached from the request that queued it.
    pub fn activate(&self, host: &dyn HostCtx, row: &DownloadRow) {
        let client = match host.db().get().and_then(|c| Ok(db::get_download_client(&c, &row.client_id)?)) {
            Ok(Some(c)) => c,
            _ => {
                let _ = db::set_download_status(host.db(), &row.id, "failed", Some("download client unavailable"));
                return;
            }
        };
        let engine = match self.engine_for(&client) {
            Ok(e) => e,
            Err(e) => {
                let _ = db::set_download_status(host.db(), &row.id, "failed", Some(&format!("engine unavailable: {e:#}")));
                return;
            }
        };
        // librqbit routes all its traffic through the VPN proxy and a
        // `0.0.0.0/0` tunnel can't reach a LAN indexer, so its own `.torrent`
        // fetch hangs: fetch it ourselves, direct, and hand over the bytes.
        let prefetched = match self.prefetch_torrent(host, row, &client) {
            Ok(p) => p,
            Err(()) => return,
        };
        let added = engine.add(&AddTorrentReq {
            magnet_or_url: &row.magnet_or_url,
            download_dir: row.save_path.as_deref(),
            label: LABEL,
            only_files: row.only_files.as_deref(),
            torrent_bytes: prefetched.as_deref(),
        });
        match added {
            Ok(client_ref) => self.reconcile_added(host, row, &*engine, &client_ref),
            Err(e) => {
                let msg = format!("{e:#}");
                tracing::warn!(id = %row.id, release = %row.release_title, error = %msg, "torrent add failed");
                let _ = db::set_download_status(host.db(), &row.id, "failed", Some(&msg));
            }
        }
    }

    fn prefetch_torrent(
        &self,
        host: &dyn HostCtx,
        row: &DownloadRow,
        client: &DownloadClientRow,
    ) -> Result<Option<Vec<u8>>, ()> {
        if client.kind != "rqbit" || !row.magnet_or_url.starts_with("http") {
            return Ok(None);
        }
        match fetch_torrent_for(host, row) {
            Ok(bytes) => {
                tracing::info!(id = %row.id, bytes = bytes.len(), "fetched .torrent directly (bypassing VPN)");
                Ok(Some(bytes))
            }
            Err(e) => {
                let msg = format!("could not fetch .torrent from the indexer: {e:#}");
                tracing::warn!(id = %row.id, error = %msg, "torrent file fetch failed");
                let _ = db::set_download_status(host.db(), &row.id, "failed", Some(&msg));
                Err(())
            }
        }
    }

    fn reconcile_added(
        &self,
        host: &dyn HostCtx,
        row: &DownloadRow,
        engine: &dyn DownloadClient,
        client_ref: &str,
    ) {
        let current = host
            .db()
            .get()
            .ok()
            .and_then(|c| db::get_download(&c, &row.id).ok().flatten())
            .map(|r| r.status);
        match current.as_deref() {
            None => {
                let _ = engine.remove(client_ref, true);
                tracing::info!(id = %row.id, "torrent add landed after removal; dropped");
            }
            Some("paused") => {
                let _ = engine.pause(client_ref);
                let _ = db::set_download_ref(host.db(), &row.id, client_ref);
                tracing::info!(release = %row.release_title, "torrent added then paused (paused while adding)");
            }
            _ => self.reconcile_dedup(host, row, client_ref),
        }
    }

    // The engine returns the same ref for identical content from another URL.
    fn reconcile_dedup(&self, host: &dyn HostCtx, row: &DownloadRow, client_ref: &str) {
        let dup = host
            .db()
            .get()
            .ok()
            .and_then(|c| db::other_active_download_with_ref(&c, &row.id, client_ref).ok().flatten());
        if let Some(other) = dup {
            let name = other.title.as_deref().unwrap_or(&other.release_title);
            let _ = db::set_download_status(host.db(), &row.id, "failed", Some(&format!("duplicate of \"{name}\" (same torrent already downloading)")));
            tracing::info!(id = %row.id, "grab duplicates a live download; marked failed");
            return;
        }
        if let Err(e) = db::activate_download(host.db(), &row.id, client_ref) {
            tracing::warn!(id = %row.id, error = %format!("{e:#}"), "failed to record activated torrent");
        }
        tracing::info!(release = %row.release_title, hash = %client_ref, "torrent added to engine");
    }

    /// Resets the row to `queued`; the caller re-runs [`Self::activate`].
    pub fn retry(&self, host: &dyn HostCtx, id: &str) -> Result<DownloadRow> {
        let (row, client) = self.row_and_client(host, id)?;
        if !self.gate_open() {
            bail!("downloads are held by the VPN kill switch");
        }
        if !row.client_ref.is_empty() {
            if let Ok(engine) = self.engine_for(&client) {
                let _ = engine.remove(&row.client_ref, false);
            }
        }
        db::reset_download_for_retry(host.db(), id)?;
        let conn = host.db().get()?;
        let row = db::get_download(&conn, id)?.ok_or_else(|| anyhow!("download not found"))?;
        Ok(row)
    }

    /// Drops the engine torrent and its data but KEEPS the ledger row.
    pub fn drop_data(&self, host: &dyn HostCtx, row: &DownloadRow) {
        if row.client_ref.is_empty() {
            return;
        }
        let client = host.db().get().ok().and_then(|c| db::get_download_client(&c, &row.client_id).ok().flatten());
        if let Some(client) = client {
            if let Ok(engine) = self.engine_for(&client) {
                if let Err(e) = engine.remove(&row.client_ref, true) {
                    tracing::warn!(id = %row.id, error = %format!("{e:#}"), "delete-after-import: engine remove failed");
                    return;
                }
                // Blank the ref so nothing polls a torrent the engine dropped.
                let _ = db::set_download_ref(host.db(), &row.id, "");
                tracing::info!(release = %row.release_title, "deleted torrent + data after import");
            }
        }
    }

    /// An empty `client_ref` means the row is still being added: the engine
    /// call is skipped and `activate()` honors the ledger when the add lands.
    pub fn pause(&self, host: &dyn HostCtx, id: &str) -> Result<()> {
        let (row, client) = self.row_and_client(host, id)?;
        if !row.client_ref.is_empty() {
            self.engine_for(&client)?.pause(&row.client_ref)?;
        }
        db::set_download_status(host.db(), id, "paused", None)?;
        Ok(())
    }

    pub fn resume(&self, host: &dyn HostCtx, id: &str) -> Result<()> {
        let (row, client) = self.row_and_client(host, id)?;
        if row.client_ref.is_empty() {
            db::set_download_status(host.db(), id, "queued", None)?;
            return Ok(());
        }
        self.engine_for(&client)?.resume(&row.client_ref)?;
        db::set_download_status(host.db(), id, "downloading", None)?;
        Ok(())
    }

    pub fn remove(&self, host: &dyn HostCtx, id: &str, delete_data: bool) -> Result<()> {
        let (row, client) = self.row_and_client(host, id)?;
        // Best-effort: the ledger must be cleanable even if the engine errors.
        if !row.client_ref.is_empty() {
            if let Ok(engine) = self.engine_for(&client) {
                if let Err(e) = engine.remove(&row.client_ref, delete_data) {
                    tracing::warn!(id, error = %format!("{e:#}"), "engine remove failed");
                }
            }
        }
        db::delete_download_row(host.db(), id)?;
        Ok(())
    }

    /// Never touches a foreign torrent in a shared external client.
    pub fn pause_all(&self, host: &dyn HostCtx) -> Result<usize> {
        let rows = {
            let conn = host.db().get()?;
            db::active_downloads(&conn)?
        };
        let mut n = 0;
        for row in rows {
            if row.status == "paused" {
                continue;
            }
            match self.pause(host, &row.id) {
                Ok(()) => n += 1,
                Err(e) => tracing::warn!(id = %row.id, error = %format!("{e:#}"), "pause_all: skipped a download"),
            }
        }
        Ok(n)
    }

    pub fn resume_all(&self, host: &dyn HostCtx) -> Result<usize> {
        let rows = {
            let conn = host.db().get()?;
            db::active_downloads(&conn)?
        };
        let mut n = 0;
        for row in rows {
            if row.status != "paused" {
                continue;
            }
            match self.resume(host, &row.id) {
                Ok(()) => n += 1,
                Err(e) => tracing::warn!(id = %row.id, error = %format!("{e:#}"), "resume_all: skipped a download"),
            }
        }
        Ok(n)
    }

    pub fn reannounce(&self, host: &dyn HostCtx, id: &str) -> Result<()> {
        let (row, client) = self.row_and_client(host, id)?;
        if !row.client_ref.is_empty() {
            self.engine_for(&client)?.reannounce(&row.client_ref)?;
        }
        Ok(())
    }

    pub fn reannounce_all(&self, host: &dyn HostCtx) -> Result<usize> {
        let rows = {
            let conn = host.db().get()?;
            db::active_downloads(&conn)?
        };
        let mut n = 0;
        for row in rows {
            if row.client_ref.is_empty() || row.status == "paused" {
                continue;
            }
            match self.reannounce(host, &row.id) {
                Ok(()) => n += 1,
                Err(e) => tracing::warn!(id = %row.id, error = %format!("{e:#}"), "reannounce_all: skipped a download"),
            }
        }
        Ok(n)
    }

    fn row_and_client(&self, host: &dyn HostCtx, id: &str) -> Result<(DownloadRow, DownloadClientRow)> {
        let conn = host.db().get()?;
        let row = db::get_download(&conn, id)?.ok_or_else(|| anyhow!("download not found"))?;
        let client = db::get_download_client(&conn, &row.client_id)?
            .ok_or_else(|| anyhow!("download client no longer configured"))?;
        Ok((row, client))
    }
}

pub use kroma_module_sdk::ports::GrabSpec;

/// The local wireproxy SOCKS5 bridge peers are routed through (librqbit only
/// proxies via SOCKS5). `None` = no VPN, torrent traffic goes out directly.
pub fn active_proxy_url(host: &dyn HostCtx) -> Option<String> {
    kroma_module_sdk::ports::vpn_proxy(host)
        .and_then(|p| p.proxy_url(host))
}

fn vpn_sealed_expected(host: &dyn HostCtx) -> bool {
    host.module_enabled("tv.kroma.vpn") && !host.setting_str("vpnWgConfig", "").trim().is_empty()
}

fn kbps_setting(host: &dyn HostCtx, key: &str) -> Option<u32> {
    let kbps = host.setting_i64(key, 0);
    (kbps > 0).then(|| u32::try_from(kbps.saturating_mul(1024)).unwrap_or(u32::MAX))
}

fn fetch_torrent_for(host: &dyn HostCtx, row: &db::DownloadRow) -> Result<Vec<u8>> {
    // Trackers behind Cloudflare intermittently drop the TLS connection
    // (`curl (35) SSL_ERROR_ZERO_RETURN`, reset, timeout) and a fresh attempt
    // almost always succeeds. Content errors are NOT retried.
    let mut last = None;
    for attempt in 0..3u64 {
        if attempt > 0 {
            std::thread::sleep(std::time::Duration::from_millis(600 * attempt));
        }
        match fetch_torrent_once(host, row) {
            Ok(bytes) => return Ok(bytes),
            Err(e) if is_transient_fetch(&e) => {
                tracing::warn!(id = %row.id, attempt = attempt + 1, error = %format!("{e:#}"), "torrent fetch transient failure; retrying");
                last = Some(e);
            }
            Err(e) => return Err(e),
        }
    }
    Err(last.unwrap_or_else(|| anyhow!("torrent fetch failed")))
}

// Private trackers cookie-gate the download, so a built-in indexer is fetched
// through its authenticated Cardigann session rather than plainly.
fn fetch_torrent_once(host: &dyn HostCtx, row: &db::DownloadRow) -> Result<Vec<u8>> {
    if let Some(indexer_id) = &row.indexer_id {
        if let Some(port) =
            kroma_module_sdk::ports::torrent_fetch(host)
        {
            if let Some(result) = port.fetch_torrent(host, indexer_id, &row.magnet_or_url) {
                return result;
            }
        }
    }
    fetch_torrent_file(&row.magnet_or_url)
}

fn is_transient_fetch(err: &anyhow::Error) -> bool {
    let msg = format!("{err:#}");
    msg.contains("curl exit")
        || msg.contains("SSL")
        || msg.contains("timed out")
        || msg.contains("Connection reset")
        || msg.contains("empty response")
}

fn fetch_torrent_file(url: &str) -> Result<Vec<u8>> {
    let resp = kroma_module_sdk::http::Fetch::new().max_time(30).get(url)?.ensure_ok()?;
    if resp.body.is_empty() {
        bail!("indexer returned an empty response");
    }
    // A tracker error page is HTML/JSON, not a bencoded torrent (starts with 'd').
    if resp.body.first() != Some(&b'd') {
        bail!("indexer did not return a .torrent file (got: {})", snippet(&resp.body));
    }
    Ok(resp.body)
}

fn snippet(body: &[u8]) -> String {
    String::from_utf8_lossy(body).chars().take(120).collect::<String>().replace('\n', " ")
}

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

pub struct DownloadDb;

impl kroma_module_sdk::ports::DownloadDbPort for DownloadDb {
    fn completed_downloads(&self, host: &dyn HostCtx) -> Result<Vec<DownloadRow>> {
        let conn = host.db().get()?;
        Ok(db::completed_downloads(&conn)?)
    }
    fn mark_download_imported(
        &self,
        host: &dyn HostCtx,
        id: &str,
        paths: &[String],
        now_ms: i64,
    ) -> Result<()> {
        db::mark_download_imported(host.db(), id, paths, now_ms)
    }
    fn set_download_status(
        &self,
        host: &dyn HostCtx,
        id: &str,
        status: &str,
        error: Option<&str>,
    ) -> Result<bool> {
        db::set_download_status(host.db(), id, status, error)
    }
}
