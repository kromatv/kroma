//! How fast the engine is allowed to go, how fast it actually went, and how
//! many downloads may move at once.

use kroma_module_sdk::host::HostCtx;
use kroma_module_sdk::primitives::now_ms;

use crate::db;
use crate::SpeedSample;

use super::DownloadManager;

/// Samples kept for the queue's throughput chart. At the monitor's 5 s active
/// tick this is the last 15 minutes.
pub const HISTORY_LEN: usize = 180;

pub const DOWN_KBPS_KEY: &str = "rqbitDownKbps";
pub const UP_KBPS_KEY: &str = "rqbitUpKbps";
pub const MAX_ACTIVE_KEY: &str = "torrentMaxActive";

/// A kbps setting as bytes per second, with `<= 0` meaning unlimited.
pub fn bps_setting(host: &dyn HostCtx, key: &str) -> Option<u32> {
    let kbps = host.setting_i64(key, 0);
    (kbps > 0).then(|| u32::try_from(kbps.saturating_mul(1024)).unwrap_or(u32::MAX))
}

impl DownloadManager {
    /// Records one throughput sample, dropping the oldest once the window is
    /// full.
    pub fn record_speed(&self, down_bps: u64, up_bps: u64, active: u32, peers: u32) {
        let mut history = self.speed_history.lock().unwrap();
        if history.len() >= HISTORY_LEN {
            history.remove(0);
        }
        history.push(SpeedSample {
            at_ms: now_ms(),
            down_bps,
            up_bps,
            active,
            peers,
        });
    }

    /// The recent throughput, oldest sample first.
    pub fn speed_history(&self) -> Vec<SpeedSample> {
        self.speed_history.lock().unwrap().clone()
    }

    pub fn apply_rate_limits(&self, host: &dyn HostCtx) {
        let Some(engine) = self.rqbit() else { return };
        engine.set_rate_limits(bps_setting(host, DOWN_KBPS_KEY), bps_setting(host, UP_KBPS_KEY));
    }

    /// How many downloads may hold an engine slot at once. `0` (the default) is
    /// unlimited.
    pub fn max_active(&self, host: &dyn HostCtx) -> Option<i64> {
        let max = host.setting_i64(MAX_ACTIVE_KEY, 0);
        (max > 0).then_some(max)
    }

    /// Whether one more download may start right now. An unset cap always says
    /// yes, and so does a ledger we cannot read: refusing to start on a failed
    /// count would strand the queue.
    pub fn slot_available(&self, host: &dyn HostCtx) -> bool {
        let Some(max) = self.max_active(host) else {
            return true;
        };
        let Ok(running) = self
            .core()
            .get()
            .and_then(|c| Ok(db::running_download_count(&c)?))
        else {
            return true;
        };
        running < max
    }

    /// The queued downloads that may start now, oldest grab first.
    pub fn claim_free_slots(&self, host: &dyn HostCtx) -> Vec<crate::db::DownloadRow> {
        let Ok(conn) = self.core().get() else {
            return Vec::new();
        };
        let waiting: Vec<crate::db::DownloadRow> = db::queued_downloads(&conn)
            .unwrap_or_default()
            .into_iter()
            .filter(crate::db::DownloadRow::never_reached_an_engine)
            .collect();
        let Some(max) = self.max_active(host) else {
            return waiting;
        };
        let Ok(running) = db::running_download_count(&conn) else {
            return waiting;
        };
        let free = (max - running).max(0) as usize;
        waiting.into_iter().take(free).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_module_sdk::host::testing::StubHost;

    #[test]
    fn a_kbps_ceiling_becomes_bytes_and_zero_means_unlimited() {
        let host = StubHost::new().with_setting(DOWN_KBPS_KEY, serde_json::json!(1024));

        assert_eq!(bps_setting(&host, DOWN_KBPS_KEY), Some(1024 * 1024));
        assert_eq!(bps_setting(&host, UP_KBPS_KEY), None);
    }
}
