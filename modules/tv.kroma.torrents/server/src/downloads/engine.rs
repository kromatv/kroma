use std::sync::Arc;

use kroma_module_sdk::host::HostCtx;

use crate::db;
use crate::{RqbitConfig, RqbitEngine};

use super::gate::{active_proxy_url, vpn_sealed_expected};
use super::DownloadManager;

impl DownloadManager {
    /// Errors are logged, not fatal. The new session starts before the old one
    /// stops, so a failed restart leaves the previous engine running.
    pub async fn start_rqbit(&self, host: &dyn HostCtx) {
        // Never bring the engine up while the embedded client is disabled; a
        // missing row means first boot before seeding, treated as enabled.
        if let Ok(conn) = self.store().get() {
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
                tracing::info!(
                    proxy = cfg.socks_proxy_url.is_some(),
                    "embedded torrent engine started"
                );
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
    pub fn live_stats(&self) -> std::collections::HashMap<String, (u64, u64, u32, u32)> {
        let mut out = std::collections::HashMap::new();
        let Ok(rows) = self
            .core()
            .get()
            .and_then(|c| Ok(db::active_downloads(&c)?))
        else {
            return out;
        };
        for row in rows {
            if row.client_ref.is_empty() {
                continue;
            }
            let client = match self
                .store()
                .get()
                .and_then(|c| Ok(db::get_download_client(&c, &row.client_id)?))
            {
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
        let Some(proxy) = active_proxy_url(host) else {
            return;
        };
        let Some(engine) = self.rqbit() else { return };
        let client = engine.client();
        let session_dir = self.state_dir.join("session");
        let rows = match self
            .core()
            .get()
            .and_then(|c| Ok(db::active_downloads(&c)?))
        {
            Ok(rows) => rows,
            Err(_) => return,
        };
        for row in rows {
            if row.client_id != db::EMBEDDED_CLIENT_ID || row.client_ref.is_empty() {
                continue;
            }
            let Ok(Some(status)) = client.status(&row.client_ref) else {
                continue;
            };
            // A reseed is a remove/re-add, which RESETS the torrent to 0%, so
            // only touch a grab with no progress, no peer and none ever seen.
            if status.progress > 0.0 || status.peers > 0 || status.peers_seen > 0 {
                continue;
            }
            // librqbit persists `<info_hash>.torrent`; client_ref is that hex.
            let path = session_dir.join(format!("{}.torrent", row.client_ref));
            let Ok(bytes) = std::fs::read(&path) else {
                continue;
            };
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

    /// Drops the session: no download, no seed, no DHT. Idempotent.
    pub fn stop_rqbit(&self) {
        if let Some(engine) = self.rqbit.write().unwrap().take() {
            engine.stop();
            tracing::info!("embedded torrent engine stopped");
        }
    }

    /// `start_rqbit` refuses to come back up until re-enabled, so this survives
    /// restarts.
    pub fn disable_embedded(&self) {
        let mut held = Vec::new();
        if let Ok(conn) = self.core().get() {
            if let Ok(rows) = db::active_downloads(&conn) {
                drop(conn);
                for row in rows {
                    if row.client_id == db::EMBEDDED_CLIENT_ID && row.status != "paused" {
                        let _ = db::set_download_status(self.core(), &row.id, "paused", None);
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
    pub fn resume_after_enable(&self) {
        let held = std::mem::take(&mut *self.paused_by_disable.lock().unwrap());
        for id in held {
            let _ = db::set_download_status(self.core(), &id, "downloading", None);
        }
    }
}

fn kbps_setting(host: &dyn HostCtx, key: &str) -> Option<u32> {
    let kbps = host.setting_i64(key, 0);
    (kbps > 0).then(|| u32::try_from(kbps.saturating_mul(1024)).unwrap_or(u32::MAX))
}
