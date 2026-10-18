//! What one poll of one torrent means for its ledger row.

use crate::db;
use kroma_module_sdk::host::{Event, HostCtx};
use kroma_module_sdk::primitives::now_ms;
use serde_json::json;

use super::super::DownloadManager;

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
    pub(super) fn apply_status(
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
        if let Some(hash) = status.info_hash.as_deref() {
            let _ = db::set_download_info_hash(self.core(), &row.id, hash);
        }
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
            let _ = db::set_download_contents(self.store(), &row.id, &status.files);
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
