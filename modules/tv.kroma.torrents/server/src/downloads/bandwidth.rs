use kroma_module_sdk::host::HostCtx;
use kroma_module_sdk::primitives::now_ms;

use crate::bandwidth::meter::Seal;
use crate::bandwidth::{self, BandwidthView, Range};
use crate::db;

use super::gate::vpn_sealed_expected;
use super::DownloadManager;

const HOUR: i64 = 3_600;
const DAY: i64 = 24 * HOUR;

const LADDER: &[(i64, i64)] = &[
    (DAY, 5 * 60),
    (7 * DAY, 30 * 60),
    (30 * DAY, 6 * HOUR),
    (365 * DAY, DAY),
];

const FOLD_EVERY: i64 = HOUR;

fn now_secs() -> i64 {
    now_ms().div_euclid(1_000)
}

impl DownloadManager {
    pub(super) fn sample_bandwidth(&self, host: &dyn HostCtx) {
        let Ok(conn) = self.core().get() else { return };
        let Ok(counters) = db::transferred_bytes(&conn, db::EMBEDDED_CLIENT_ID) else {
            return;
        };
        drop(conn);
        let closed = self
            .bandwidth
            .lock()
            .unwrap()
            .read(now_secs(), counters, self.seal_now(host));
        let Some(closed) = closed else { return };
        if let Err(e) = db::add_bandwidth_sample(self.store(), &closed) {
            tracing::warn!(error = %format!("{e:#}"), "vpn bandwidth sample not stored");
            return;
        }
        if closed.at.rem_euclid(FOLD_EVERY) == 0 {
            self.fold_bandwidth(closed.at);
        }
    }

    fn fold_bandwidth(&self, now: i64) {
        for (age, step) in LADDER {
            if let Err(e) = db::fold_bandwidth_samples(self.store(), now - age, *step) {
                tracing::warn!(error = %format!("{e:#}"), "vpn bandwidth retention pass failed");
                return;
            }
        }
    }

    fn seal_now(&self, host: &dyn HostCtx) -> Seal {
        if !vpn_sealed_expected(host) {
            return Seal::NoBridge;
        }
        match self.vpn_status() {
            Some(status) if status.connected => Seal::Held,
            _ => Seal::Broken,
        }
    }

    /// Blocking.
    pub fn bandwidth(&self, host: &dyn HostCtx, range: Range) -> anyhow::Result<BandwidthView> {
        bandwidth::read(self.store(), range, now_secs(), vpn_sealed_expected(host))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bandwidth::meter::STEP;

    #[test]
    fn every_rung_of_the_ladder_is_coarser_and_older_than_the_one_below() {
        let widths: Vec<i64> = LADDER.iter().map(|(_, step)| *step).collect();
        let ages: Vec<i64> = LADDER.iter().map(|(age, _)| *age).collect();

        assert!(widths.windows(2).all(|pair| pair[0] < pair[1]));
        assert!(ages.windows(2).all(|pair| pair[0] < pair[1]));
        assert!(widths[0] > STEP);
    }
}
