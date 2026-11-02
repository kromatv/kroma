//! Keeping the helper running: noticing it ended, and how long to wait before the
//! next start.

use std::sync::atomic::Ordering;
use std::time::Duration;

use kroma_module_sdk::host::HostCtx;

use super::DownloadManager;
use super::gate::vpn_sealed_expected;

const STABLE_FOR: Duration = Duration::from_secs(60);
const START_RETRY: Duration = Duration::from_secs(6);
const LONGEST_START_RETRY: Duration = Duration::from_secs(300);
const MOST_DOUBLINGS: u32 = 6;
const NETWORK_SETTLES: Duration = Duration::from_secs(6);

fn start_retry_after(failures: u32) -> Duration {
    let doublings = failures.saturating_sub(1).min(MOST_DOUBLINGS);
    (START_RETRY * 2_u32.pow(doublings)).min(LONGEST_START_RETRY)
}

impl DownloadManager {
    /// Restart the helper for a network that just changed, then once more if the
    /// host had not caught up yet: what it says about its networks lags a change by
    /// a few seconds, and a helper started on the stale answer would run on the
    /// wrong side of the tunnel until the monitor noticed.
    pub async fn follow_the_network(&self, host: &dyn HostCtx) {
        self.restart_rqbit(host).await;
        tokio::time::sleep(NETWORK_SETTLES).await;
        if self.helper_on_the_wrong_side(host) {
            self.restart_rqbit(host).await;
        }
    }

    /// Notice a helper that ended on its own and let go of it, so the monitor
    /// starts another.
    pub(super) fn watch_helper(&self) {
        let Some(engine) = self.rqbit() else { return };
        let Some(code) = engine.exited() else { return };
        self.rqbit.write().unwrap().take();
        if engine.uptime() >= STABLE_FOR {
            self.start_failures.store(0, Ordering::Relaxed);
        }
        let failures = self.start_failures.fetch_add(1, Ordering::Relaxed) + 1;
        tracing::warn!(
            code,
            said = %engine.last_words(),
            retry_in_secs = start_retry_after(failures).as_secs(),
            "the rqbit helper exited"
        );
    }

    /// Whether the helper was started for a network that has since appeared or gone.
    pub(super) fn helper_on_the_wrong_side(&self, host: &dyn HostCtx) -> bool {
        self.rqbit()
            .is_some_and(|engine| engine.is_sealed() != vpn_sealed_expected(host))
    }

    /// How long to wait between two attempts at starting the helper.
    pub(super) fn start_retry(&self) -> Duration {
        start_retry_after(self.start_failures.load(Ordering::Relaxed))
    }
}

#[cfg(test)]
mod tests;
