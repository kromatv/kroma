use std::sync::Arc;

use kroma_module_sdk::host::HostCtx;

use kroma_module_sdk::primitives::now_ms;

use crate::db;
use crate::{RqbitConfig, RqbitEngine};

const SLOW_START: std::time::Duration = std::time::Duration::from_secs(30);

use super::gate::{active_proxy_url, vpn_sealed_expected};
use super::DownloadManager;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct LiveStat {
    pub down_bps: u64,
    pub up_bps: u64,
    pub peers: u32,
    pub peers_seen: u32,
}

impl DownloadManager {
    /// Brings the engine up unless one already runs. Callers race at boot (the
    /// enable hook and the monitor's first tick), so starts are single-flight.
    pub async fn ensure_rqbit(&self, host: &dyn HostCtx) {
        let _gate = self.engine_gate.lock().await;
        if self.rqbit().is_some() {
            return;
        }
        self.bring_up(host).await;
    }

    /// Replaces the running engine, e.g. after a VPN change. The old session is
    /// stopped before the new one opens the same persistence directory, so a
    /// failed start leaves no engine and the monitor retries. Errors are logged.
    pub async fn restart_rqbit(&self, host: &dyn HostCtx) {
        let _gate = self.engine_gate.lock().await;
        let old = self.rqbit.write().unwrap().take();
        if let Some(old) = old {
            old.shutdown().await;
        }
        self.bring_up(host).await;
    }

    async fn bring_up(&self, host: &dyn HostCtx) {
        let retiring = self.retiring.lock().unwrap().take();
        if let Some(old) = retiring {
            old.shutdown().await;
        }
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
            download_bps: super::bps_setting(host, super::DOWN_KBPS_KEY),
            upload_bps: super::bps_setting(host, super::UP_KBPS_KEY),
        };
        *self.starting_since.lock().unwrap() = Some(now_ms());
        let began = std::time::Instant::now();
        let outcome = RqbitEngine::start(&cfg).await;
        *self.starting_since.lock().unwrap() = None;
        if began.elapsed() >= SLOW_START {
            tracing::warn!(
                seconds = began.elapsed().as_secs(),
                "the embedded engine took a long time to restore its session; a torrent with no \
                 cached metadata blocks the restore until the DHT answers for it"
            );
        }
        match outcome {
            Ok(engine) => {
                tracing::info!(
                    proxy = cfg.socks_proxy_url.is_some(),
                    "embedded torrent engine started"
                );
                *self.rqbit.write().unwrap() = Some(engine);
            }
            Err(e) => {
                tracing::warn!(error = %format!("{e:#}"), "embedded torrent engine start failed");
            }
        }
    }

    /// How long the engine has been starting, in ms. `None` when it is not.
    pub fn starting_for(&self) -> Option<i64> {
        let since = (*self.starting_since.lock().unwrap())?;
        Some((now_ms() - since).max(0))
    }

    pub fn rqbit(&self) -> Option<Arc<RqbitEngine>> {
        self.rqbit.read().unwrap().clone()
    }

    /// `None` for an external engine: that one is a daemon this process can only
    /// learn about by asking it, which is what the Test button is for.
    pub fn embedded_state(&self, enabled: bool) -> Option<crate::EngineState> {
        if !crate::RQBIT_COMPILED {
            return Some(crate::EngineState::NotCompiled);
        }
        if !enabled {
            return Some(crate::EngineState::Stopped);
        }
        Some(if self.rqbit().is_some() {
            crate::EngineState::Ready
        } else {
            crate::EngineState::Starting
        })
    }

    /// What every running download is doing, keyed by download id. Blocking.
    pub fn live_stats(&self) -> std::collections::HashMap<String, LiveStat> {
        let mut out = std::collections::HashMap::new();
        let Ok(rows) = self
            .core()
            .get()
            .and_then(|c| Ok(db::active_downloads(&c)?))
        else {
            return out;
        };
        for row in rows {
            if row.never_reached_an_engine() {
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
                    out.insert(
                        row.id,
                        LiveStat {
                            down_bps: s.down_bps,
                            up_bps: s.up_bps,
                            peers: s.peers,
                            peers_seen: s.peers_seen,
                        },
                    );
                }
            }
        }
        out
    }

    /// Announce through the proxy ourselves and inject the peers, for torrents
    /// stuck at 0 peers. Blocking.
    #[cfg(feature = "rqbit")]
    pub fn reseed_stalled(&self, _host: &dyn HostCtx) {
        let Some(engine) = self.rqbit() else { return };
        if !engine.is_sealed() {
            return;
        }
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
            if !status.is_stalled_at_start() {
                continue;
            }
            // librqbit persists `<info_hash>.torrent`; client_ref is that hex.
            let path = session_dir.join(format!("{}.torrent", row.client_ref));
            let Ok(bytes) = std::fs::read(&path) else {
                continue;
            };
            let peers = engine.proxied_peers(Some(&bytes), "");
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
            *self.retiring.lock().unwrap() = Some(engine);
            tracing::info!("embedded torrent engine stopped");
        }
    }

    /// `ensure_rqbit` refuses to come back up until re-enabled, so this survives
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
