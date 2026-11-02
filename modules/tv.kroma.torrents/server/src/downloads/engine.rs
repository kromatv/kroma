use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

use kroma_module_sdk::host::HostCtx;

use kroma_module_sdk::primitives::now_ms;

use crate::db;
use crate::rqbit::ports;
use crate::{RqbitConfig, RqbitEngine};

const SLOW_START: Duration = Duration::from_secs(30);

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

    /// Replaces the running engine, e.g. after a VPN change. The old helper has
    /// ended before the new one opens the same persistence directory, so a failed
    /// start leaves no engine and the monitor retries. Errors are logged.
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
        if let Ok(conn) = self.store().get() {
            if let Ok(Some(c)) = db::get_download_client(&conn, db::EMBEDDED_CLIENT_ID) {
                if !c.enabled {
                    drop(conn);
                    self.stop_rqbit();
                    return;
                }
            }
        }
        let proxy = active_proxy_url(host);
        if proxy.is_none() && vpn_sealed_expected(host) {
            tracing::warn!(
                "VPN is configured but its proxy is not resolvable; embedded engine start deferred (never runs unsealed)"
            );
            return;
        }
        let sealed = proxy.is_some();
        let chosen = ports::chosen(&self.state_dir);
        let cfg = RqbitConfig {
            program: self.helper.clone(),
            session_dir: self.state_dir.join("session"),
            download_dir: self.downloads_dir.clone(),
            work_dir: self.state_dir.join("adding"),
            socks_proxy_url: Some(crate::port::vpn::gateway_placeholder(sealed)),
            sealed,
            api_port: chosen.api,
            listen_port: named_port(host).unwrap_or(chosen.peers),
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
                "the rqbit helper took a long time to restore its session; a torrent with no \
                 cached metadata blocks the restore until the DHT answers for it"
            );
        }
        match outcome {
            Ok(engine) => {
                tracing::info!(sealed, api_port = cfg.api_port, "rqbit helper started");
                *self.rqbit.write().unwrap() = Some(engine);
            }
            Err(e) => {
                self.start_failures.fetch_add(1, Ordering::Relaxed);
                ports::rotate(&self.state_dir);
                tracing::warn!(error = %format!("{e:#}"), "rqbit helper start failed");
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

    /// Announce through the gateway ourselves and hand one stalled torrent the
    /// peers, each in its turn across passes, since an announce takes the module's
    /// one instance for its whole length. Blocking.
    pub fn reseed_stalled(&self, _host: &dyn HostCtx) {
        let Some(engine) = self.rqbit() else { return };
        if !engine.is_sealed() {
            return;
        }
        let client = engine.client();
        let rows = match self
            .core()
            .get()
            .and_then(|c| Ok(db::active_downloads(&c)?))
        {
            Ok(rows) => rows,
            Err(_) => return,
        };
        let stalled: Vec<db::DownloadRow> = rows
            .into_iter()
            .filter(|row| row.client_id == db::EMBEDDED_CLIENT_ID && !row.client_ref.is_empty())
            .filter(|row| {
                matches!(client.status(&row.client_ref), Ok(Some(status)) if status.is_stalled_at_start())
            })
            .collect();
        if stalled.is_empty() {
            return;
        }
        let turn = self.reseed_turn.fetch_add(1, Ordering::Relaxed) % stalled.len();
        let row = &stalled[turn];
        let path = self
            .state_dir
            .join("session")
            .join(format!("{}.torrent", row.client_ref));
        let Ok(bytes) = std::fs::read(&path) else {
            return;
        };
        let peers = engine.proxied_peers(Some(&bytes), "");
        if peers.is_empty() {
            return;
        }
        match engine.add_peers(&row.client_ref, &peers) {
            Ok(added) => tracing::info!(
                id = %row.id,
                added,
                "handed a stalled torrent peers from our proxied tracker announce"
            ),
            Err(e) => {
                tracing::warn!(id = %row.id, error = %format!("{e:#}"), "torrent re-seed failed")
            }
        }
    }

    /// Ends the helper: no download, no seed, no DHT. Idempotent.
    pub fn stop_rqbit(&self) {
        if let Some(engine) = self.rqbit.write().unwrap().take() {
            engine.stop();
            *self.retiring.lock().unwrap() = Some(engine);
            tracing::info!("rqbit helper stopped");
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

    /// The caller must have restarted the helper first. A row that had not reached
    /// the engine yet goes back to the queue, where the monitor adds it.
    pub fn resume_after_enable(&self) {
        let held = std::mem::take(&mut *self.paused_by_disable.lock().unwrap());
        for id in held {
            let never_added = self
                .core()
                .get()
                .ok()
                .and_then(|c| db::get_download(&c, &id).ok().flatten())
                .is_some_and(|row| row.never_reached_an_engine());
            let status = if never_added { "queued" } else { "downloading" };
            let _ = db::set_download_status(self.core(), &id, status, None);
        }
    }
}

fn named_port(host: &dyn HostCtx) -> Option<u16> {
    u16::try_from(host.setting_i64("rqbitPort", 0))
        .ok()
        .filter(|port| *port > 0)
}

#[cfg(test)]
mod tests;
