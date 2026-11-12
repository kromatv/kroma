//! Peers for a sealed session's starving torrents, from our own tracker announce
//! through the gateway: its trackers, DHT and LSD are off, so after a restart a
//! torrent has no other way to meet a peer.

use std::time::{Duration, Instant};

use crate::db::{self, DownloadRow};

use super::DownloadManager;

const ANNOUNCE_AGAIN_AFTER: Duration = Duration::from_secs(10 * 60);

impl DownloadManager {
    /// Announce for one starving torrent and hand it the peers. Each takes its
    /// turn across passes, since an announce holds the module's one instance for
    /// its whole length, and none is announced for again within ten minutes.
    /// Blocking.
    pub fn reseed_stalled(&self) {
        let Some(engine) = self.rqbit() else { return };
        if !engine.is_sealed() {
            return;
        }
        let client = engine.client();
        let Ok(rows) = self
            .core()
            .get()
            .and_then(|c| Ok(db::active_downloads(&c)?))
        else {
            return;
        };
        let starving = rows
            .into_iter()
            .filter(|row| row.client_id == db::EMBEDDED_CLIENT_ID && !row.client_ref.is_empty())
            .filter(|row| {
                matches!(client.status(&row.client_ref), Ok(Some(status)) if status.is_starving())
            });
        let Some(row) = self.next_to_announce(starving) else {
            return;
        };
        let path = self
            .state_dir
            .join("session")
            .join(format!("{}.torrent", row.client_ref));
        let Ok(bytes) = std::fs::read(&path) else {
            return;
        };
        let peers = engine.proxied_peers(Some(&bytes), "");
        if peers.is_empty() {
            tracing::info!(id = %row.id, "our proxied tracker announce found no peer for a stalled torrent");
            return;
        }
        match engine.add_peers(&row.client_ref, &peers) {
            Ok(added) => tracing::info!(
                id = %row.id,
                offered = peers.len(),
                added,
                "handed a stalled torrent peers from our proxied tracker announce"
            ),
            Err(e) => {
                tracing::warn!(id = %row.id, error = %format!("{e:#}"), "torrent re-seed failed")
            }
        }
    }

    fn next_to_announce(&self, starving: impl Iterator<Item = DownloadRow>) -> Option<DownloadRow> {
        let mut announced = self.announced.lock().unwrap();
        let due = |row: &DownloadRow| {
            announced
                .get(&row.client_ref)
                .is_none_or(|at| at.elapsed() >= ANNOUNCE_AGAIN_AFTER)
        };
        let row = starving
            .filter(due)
            .min_by_key(|row| announced.get(&row.client_ref).copied())?;
        announced.insert(row.client_ref.clone(), Instant::now());
        Some(row)
    }
}

#[cfg(test)]
mod tests;
