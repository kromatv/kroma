//! Stopping this server so whatever supervises it starts it again: after an
//! update, on the new payload, or because the owner asked.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use tokio::sync::Notify;

use crate::state::SharedState;

/// The exit status that asks the package's service script to start the server
/// again, on the newest payload it holds.
pub const RESTART_EXIT_CODE: i32 = 75;

/// Why a restart the owner asked for was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    Unsupported,
    UpdateInProgress,
}

#[derive(Default)]
struct Restart {
    requested: AtomicBool,
    signal: Notify,
}

impl Restart {
    fn request(&self) {
        self.requested.store(true, Ordering::SeqCst);
        self.signal.notify_one();
    }

    fn requested(&self) -> bool {
        self.requested.load(Ordering::SeqCst)
    }

    async fn wait(&self) {
        if !self.requested() {
            self.signal.notified().await;
        }
    }
}

fn process() -> &'static Restart {
    static RESTART: OnceLock<Restart> = OnceLock::new();
    RESTART.get_or_init(Restart::default)
}

pub(super) fn request() {
    process().request();
}

/// Whether this server was asked to stop so it starts again.
pub fn restart_requested() -> bool {
    process().requested()
}

/// Resolves once this server is asked to stop so it starts again.
pub async fn wait_for_restart() {
    process().wait().await;
}

/// Whether something starts this server again once it exits with
/// [`RESTART_EXIT_CODE`]. Only the Synology package's service script does: a
/// container's restart policy or a service manager is invisible from here.
pub fn restartable(state: &SharedState) -> bool {
    super::package::ready(state)
}

/// Ask this server to stop gracefully and exit with [`RESTART_EXIT_CODE`].
/// Refused where nothing would start it again, and while an update is being
/// applied, since that update owns the next start.
pub fn restart(state: &SharedState) -> Result<(), Refusal> {
    let _guard = super::install::exclusive();
    if !restartable(state) {
        return Err(Refusal::Unsupported);
    }
    if super::install::in_progress(state) {
        return Err(Refusal::UpdateInProgress);
    }
    tracing::info!("the owner asked the server to restart");
    request();
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::Duration;

    use super::Restart;

    #[tokio::test]
    async fn a_restart_wakes_whoever_waits_for_it_and_whoever_comes_later() {
        let restart = Arc::new(Restart::default());
        let waiting = tokio::spawn({
            let restart = Arc::clone(&restart);
            async move { restart.wait().await }
        });
        tokio::task::yield_now().await;

        restart.request();

        tokio::time::timeout(Duration::from_secs(5), waiting)
            .await
            .unwrap()
            .unwrap();
        tokio::time::timeout(Duration::from_secs(5), restart.wait())
            .await
            .unwrap();
        assert!(restart.requested());
    }
}
