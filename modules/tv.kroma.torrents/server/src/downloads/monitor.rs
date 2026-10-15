//! The downloads monitor: a resident tokio task. Each tick polls the engines on
//! a blocking thread, mirrors progress into the ledger, publishes
//! `download.progress` frames, and flips finished torrents to `completed`.

use std::sync::Arc;
use std::time::Duration;

use crate::db;
use kroma_module_sdk::host::{Event, HostCtx};
use kroma_module_sdk::primitives::now_ms;
use serde_json::json;

use super::DownloadManager;

const ACTIVE_TICK: Duration = Duration::from_secs(5);
const IDLE_TICK: Duration = Duration::from_secs(30);
const VPN_CHECK_EVERY: Duration = Duration::from_secs(60);
const START_RETRY: Duration = Duration::from_secs(6);
// Slow: each reseed pass removes+re-adds the stalled torrents, so it must give
// injected peers time to connect before trying again.
const RESEED_EVERY: Duration = Duration::from_secs(120);

fn human_bytes(n: u64) -> String {
    const U: [&str; 4] = ["B", "KB", "MB", "GB"];
    let (mut v, mut i) = (n as f64, 0);
    while v >= 1024.0 && i < U.len() - 1 {
        v /= 1024.0;
        i += 1;
    }
    format!("{v:.1} {}", U[i])
}

impl DownloadManager {
    /// Spawn the resident monitor. Call once.
    pub fn spawn_monitor(self: &Arc<Self>, host: Arc<dyn HostCtx>) {
        let manager = self.clone();
        tokio::spawn(async move { manager.monitor_loop(host).await });
    }

    async fn monitor_loop(self: Arc<Self>, host: Arc<dyn HostCtx>) {
        let mut last_vpn_check = std::time::Instant::now() - VPN_CHECK_EVERY;
        // Start the reseed clock at "now" (not in the past): give the add-time
        // peer seed + librqbit a full interval before intervening.
        let mut last_reseed = std::time::Instant::now();
        let mut last_start_try = std::time::Instant::now() - START_RETRY;
        loop {
            if !host.module_enabled(crate::MODULE_ID) {
                tokio::time::sleep(IDLE_TICK).await;
                continue;
            }
            // At boot the VPN sidecar may not answer yet, so ensure_rqbit defers to
            // stay sealed. Retry every few seconds so the engine comes up right
            // after the VPN resolves.
            if self.awaiting_engine() && last_start_try.elapsed() >= START_RETRY {
                last_start_try = std::time::Instant::now();
                self.ensure_rqbit(&*host).await;
            }
            let vpn_due = last_vpn_check.elapsed() >= VPN_CHECK_EVERY;
            if vpn_due {
                last_vpn_check = std::time::Instant::now();
            }
            let reseed_due = last_reseed.elapsed() >= RESEED_EVERY;
            if reseed_due {
                last_reseed = std::time::Instant::now();
            }
            let had_active = tokio::task::spawn_blocking({
                let manager = self.clone();
                let host = host.clone();
                move || manager.poll_once(&*host, vpn_due, reseed_due)
            })
            .await
            .unwrap_or(false);
            let fast = had_active || self.awaiting_engine();
            tokio::time::sleep(if fast { ACTIVE_TICK } else { IDLE_TICK }).await;
        }
    }

    fn awaiting_engine(&self) -> bool {
        crate::RQBIT_COMPILED && self.rqbit().is_none()
    }

    // Same thread as `tick`, so the remove/re-add window a reseed opens is never
    // observed by a concurrent poll.
    fn poll_once(&self, host: &dyn HostCtx, vpn_due: bool, reseed_due: bool) -> bool {
        if vpn_due {
            let _ = self.vpn_check(host);
        }
        if reseed_due {
            self.reseed_stalled(host);
        }
        let had_active = self.tick(host);
        self.sample_bandwidth(host);
        self.retry_deferred_drops();
        had_active
    }

    fn tick(&self, host: &dyn HostCtx) -> bool {
        let rows = match self
            .core()
            .get()
            .and_then(|c| Ok(db::active_downloads(&c)?))
        {
            Ok(rows) => rows,
            Err(e) => {
                tracing::warn!(error = %format!("{e:#}"), "downloads monitor: ledger read failed");
                return false;
            }
        };
        if rows.is_empty() {
            return false;
        }

        let mut completed_any = false;
        for row in &rows {
            if self.process_row(host, row) {
                completed_any = true;
            }
        }
        self.link_unresolved(host, &rows);
        self.sample_throughput(host, &rows);
        // Re-asserted every tick rather than only at session start, so a
        // ceiling changed while a torrent is mid-flight takes hold without one.
        self.apply_rate_limits(host);
        self.fill_free_slots(host);

        if completed_any {
            host.trigger_job("acquisition.import", "download-complete");
        }
        true
    }

    // One row per tick: a provider lookup is a network call, and a queue that
    // arrived unlinked all at once must not become a burst of them.
    fn link_unresolved(&self, host: &dyn HostCtx, rows: &[db::DownloadRow]) {
        let Some(row) = rows
            .iter()
            .find(|row| row.tmdb_id.is_none() && row.match_source.is_none())
        else {
            return;
        };
        self.auto_link(host, &row.id);
    }

    fn sample_throughput(&self, host: &dyn HostCtx, rows: &[db::DownloadRow]) {
        let live = self.live_stats();
        let (down, up, peers) = rows.iter().fold((0, 0, 0), |(down, up, peers), row| {
            let stat = live.get(&row.id).copied().unwrap_or_default();
            (down + stat.down_bps, up + stat.up_bps, peers + stat.peers)
        });
        let running = rows
            .iter()
            .filter(|row| matches!(row.status.as_str(), "downloading" | "seeding"))
            .count() as u32;
        self.record_speed(down, up, running, peers);
        host.publish(Event::new(
            "downloads.stats",
            json!({
                "downBps": down,
                "upBps": up,
                "active": running,
                "peers": peers,
            }),
        ));
    }

    fn fill_free_slots(&self, host: &dyn HostCtx) {
        for row in self.claim_free_slots(host) {
            tracing::info!(release = %row.release_title, "queue slot free; starting held download");
            self.activate(host, &row);
        }
    }

    fn process_row(&self, host: &dyn HostCtx, row: &db::DownloadRow) -> bool {
        if row.client_ref.is_empty() {
            return false;
        }
        let client = match self
            .store()
            .get()
            .and_then(|c| Ok(db::get_download_client(&c, &row.client_id)?))
        {
            Ok(Some(c)) => c,
            _ => {
                let _ = db::set_download_status(
                    self.core(),
                    &row.id,
                    "failed",
                    Some("download client removed"),
                );
                return false;
            }
        };
        let engine = match self.engine_for(&client) {
            Ok(e) => e,
            Err(e) => {
                tracing::debug!(id = %row.id, error = %format!("{e:#}"), "engine unavailable");
                return false;
            }
        };
        match engine.status(&row.client_ref) {
            Ok(Some(status)) => self.apply_status(host, row, &status),
            Ok(None) => {
                let _ = db::set_download_status(
                    self.core(),
                    &row.id,
                    "failed",
                    Some("torrent disappeared from the download client"),
                );
                false
            }
            Err(e) => {
                tracing::debug!(id = %row.id, error = %format!("{e:#}"), "status poll failed");
                false
            }
        }
    }

    fn apply_status(
        &self,
        host: &dyn HostCtx,
        row: &db::DownloadRow,
        status: &crate::TorrentStatus,
    ) -> bool {
        tracing::info!(
            release = %row.release_title,
            state = ?status.state,
            progress = format!("{:.1}%", status.progress * 100.0),
            peers = status.peers,
            peers_seen = status.peers_seen,
            down = format!("{}/s", human_bytes(status.down_bps)),
            "download tick"
        );
        let finished = status.progress >= 1.0
            || matches!(
                status.state,
                crate::TorrentState::Completed | crate::TorrentState::Seeding
            );
        let new_status = if finished {
            "completed"
        } else {
            match status.state {
                crate::TorrentState::Paused => "paused",
                crate::TorrentState::Queued => "queued",
                // Error included: transient tracker/disk errors recover, so keep
                // polling with the error visible.
                _ => "downloading",
            }
        };
        let _ = db::update_download_bytes(
            self.core(),
            &row.id,
            status.lifetime_downloaded_bytes,
            status.lifetime_uploaded_bytes,
        );
        if finished {
            // save_path may only be known now (external clients).
            let _ = db::update_download_progress(
                self.core(),
                &row.id,
                "completed",
                1.0,
                status.save_path.as_deref(),
                None,
            );
            let _ = db::mark_download_completed(self.core(), &row.id, now_ms());
        } else {
            let _ = db::update_download_progress(
                self.core(),
                &row.id,
                new_status,
                status.progress,
                status.save_path.as_deref(),
                status.error.as_deref(),
            );
        }
        host.publish(Event::new(
            "download.progress",
            json!({
                "id": row.id,
                "requestId": row.request_id,
                "progress": status.progress,
                "downBps": status.down_bps,
                "upBps": status.up_bps,
                "peers": status.peers,
                "peersSeen": status.peers_seen,
                "state": new_status.to_string(),
            }),
        ));
        if finished {
            host.publish(Event::new(
                "download.completed",
                json!({ "id": row.id, "title": row.release_title }),
            ));
            return true;
        }
        false
    }
}
