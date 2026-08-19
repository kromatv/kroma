//! The downloads monitor: a resident tokio task (the HLS-reaper pattern, NOT a
//! cron job: the scheduler ticks at 30s, far too coarse for live progress).
//! Fast ticks while anything is active, slow idle ticks otherwise. Each tick
//! polls the engines on a blocking thread, mirrors progress into the ledger,
//! publishes `download.progress` frames, and flips finished torrents to
//! `completed` (chaining the import job). Over the HostCtx seam.

use std::sync::Arc;
use std::time::Duration;

use crate::db;
use kroma_module_sdk::host::{Event, HostCtx};
use serde_json::json;
use kroma_module_sdk::primitives::now_ms;

use super::DownloadManager;

const ACTIVE_TICK: Duration = Duration::from_secs(5);
const IDLE_TICK: Duration = Duration::from_secs(30);
const VPN_CHECK_EVERY: Duration = Duration::from_secs(60);
// How often to retry bringing the embedded engine up while it isn't running (a
// boot deferral: the VPN sidecar wasn't answering yet). Short, so the engine
// starts within seconds of the VPN resolving instead of a VPN-check away.
const START_RETRY: Duration = Duration::from_secs(6);
// How often to re-seed peer-starved embedded torrents from our own proxied
// tracker announce (see `DownloadManager::reseed_stalled`). Slow: each pass
// removes+re-adds the stalled torrents, so it must give injected peers time to
// connect before trying again.
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
    /// Spawn the resident monitor. Call once from `main` next to the reapers.
    pub fn spawn_monitor(self: &Arc<Self>, host: Arc<dyn HostCtx>) {
        let manager = self.clone();
        tokio::spawn(async move { manager.monitor_loop(host).await });
    }

    // Idle while disabled, self-heal a deferred engine start, then poll on a
    // fast (active) / slow (idle) cadence.
    async fn monitor_loop(self: Arc<Self>, host: Arc<dyn HostCtx>) {
        let mut last_vpn_check = std::time::Instant::now() - VPN_CHECK_EVERY;
        // Start the reseed clock at "now" (not in the past): give the add-time
        // peer seed + librqbit a full interval before intervening.
        let mut last_reseed = std::time::Instant::now();
        // Retry a deferred engine start immediately on the first iteration.
        let mut last_start_try = std::time::Instant::now() - START_RETRY;
        loop {
            // When the Downloads module is disabled its engine is torn down; idle
            // the monitor entirely (no polling, no VPN probe) until it is
            // re-enabled, so a disabled system does no background work.
            if !host.module_enabled(crate::MODULE_ID) {
                tokio::time::sleep(IDLE_TICK).await;
                continue;
            }
            // Self-heal a deferred engine start on a SHORT cadence (NOT the 60s VPN
            // check): at boot the VPN sidecar may not answer yet, so start_rqbit
            // defers to stay sealed. Retry every few seconds so the engine comes up
            // right after the VPN resolves. start_rqbit re-checks every guard
            // (disabled client, unresolved proxy) itself; no-op once up.
            if self.awaiting_engine() && last_start_try.elapsed() >= START_RETRY {
                last_start_try = std::time::Instant::now();
                self.start_rqbit(&*host).await;
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
            // Tick fast while we still need to bring the engine up, so the
            // boot-time start retry actually fires every START_RETRY.
            let fast = had_active || self.awaiting_engine();
            tokio::time::sleep(if fast { ACTIVE_TICK } else { IDLE_TICK }).await;
        }
    }

    // True while the embedded engine is compiled in but not yet running (a boot
    // deferral we keep retrying).
    fn awaiting_engine(&self) -> bool {
        crate::RQBIT_COMPILED && self.rqbit().is_none()
    }

    // Optional VPN probe + reseed, then `tick`. Same thread as `tick`, so the
    // remove/re-add window a reseed opens is never observed by a concurrent poll.
    fn poll_once(&self, host: &dyn HostCtx, vpn_due: bool, reseed_due: bool) -> bool {
        if vpn_due {
            let _ = self.vpn_check(host);
        }
        if reseed_due {
            self.reseed_stalled(host);
        }
        self.tick(host)
    }

    // Returns whether anything is still active (drives the tick cadence).
    fn tick(&self, host: &dyn HostCtx) -> bool {
        let rows = match self.core().get().and_then(|c| Ok(db::active_downloads(&c)?)) {
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

        if completed_any {
            // Import runs as a tracked job so its work shows in the console.
            host.trigger_job("acquisition.import", "download-complete");
        }
        true
    }

    // Returns whether the row just completed (so the caller chains the import
    // job).
    fn process_row(&self, host: &dyn HostCtx, row: &db::DownloadRow) -> bool {
        // Still being added in the background (grab enqueues, then activate()
        // fills the ref). Nothing to poll yet.
        if row.client_ref.is_empty() {
            return false;
        }
        let client =
            match self.store().get().and_then(|c| Ok(db::get_download_client(&c, &row.client_id)?)) {
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
                // Engine offline (external daemon down, embedded not started):
                // leave the row as-is and retry next tick.
                tracing::debug!(id = %row.id, error = %format!("{e:#}"), "engine unavailable");
                return false;
            }
        };
        match engine.status(&row.client_ref) {
            Ok(Some(status)) => self.apply_status(host, row, &status),
            Ok(None) => {
                // The torrent vanished from the engine (user removed it there, or a
                // session reset): the grab failed.
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

    // Mirrors a fresh engine status into the ledger + publishes progress.
    // Returns whether the row just completed.
    fn apply_status(&self, host: &dyn HostCtx, row: &db::DownloadRow, status: &crate::TorrentStatus) -> bool {
        // Visibility for "stuck at 0%": show what the swarm looks like. peers=0 &
        // seen=0 -> the tracker returned nothing (dead torrent / announce
        // blocked). seen>0 & peers=0 -> discovered but can't connect (firewall /
        // no port-forward).
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
