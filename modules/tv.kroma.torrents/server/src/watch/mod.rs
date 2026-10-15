mod arrived;
mod beside;
mod cues;
mod file;
mod hls;
mod listing;
mod probe;
mod probe_view;
mod probes;
mod sheets;
mod source;
mod start;
mod storyboard;
mod subtitles;
#[cfg(test)]
mod test_support;
mod view;
mod viewer;
mod vtt;

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::http::StatusCode;
use axum::response::Response;
use axum::Router;

use kroma_module_sdk::host::{json_error, service, HostStorage};
use kroma_module_sdk::media::hls::HlsEngine;

pub use source::Refusal;
pub use view::{SwarmRates, WatchProgressView, WatchableEntryView, WatchableFileView};
pub use viewer::Viewer;

use crate::DownloadManager;
use file::WatchedFile;
use probes::Probes;
use sheets::Boards;
use vtt::Vtts;

const UNLIMITED_CACHE: u64 = 0;
const FORGET_EVERY: std::time::Duration = std::time::Duration::from_secs(300);

pub struct Watch {
    hls: HlsEngine,
    own_base: String,
    scratch: PathBuf,
    probes: Probes,
    vtts: Vtts,
    boards: Boards,
}

impl Watch {
    pub fn new(data_dir: &Path, own_port: u16, live_sessions: usize) -> Arc<Self> {
        let own = data_dir.join("modules").join(crate::MODULE_ID);
        let scratch = own.join("watch");
        // Nothing here outlives the process that wrote it: what a viewer is
        // shown of a file still arriving is remembered in memory, and a sheet
        // or a cue left behind would have no state to go with it.
        let _ = std::fs::remove_dir_all(&scratch);
        Arc::new(Self {
            hls: HlsEngine::new(own.join("hls"), live_sessions, UNLIMITED_CACHE),
            own_base: format!("http://127.0.0.1:{own_port}"),
            scratch,
            probes: Probes::default(),
            vtts: Vtts::default(),
            boards: Boards::default(),
        })
    }

    /// Starts the HLS reaper and the sweep that forgets what this engine remembers
    /// of a download the ledger no longer holds: without it the probe answers, the
    /// cue sets and the sheet state of every film ever watched would be held for
    /// the life of the process.
    pub fn spawn_reaper(self: &Arc<Self>, downloads: Arc<DownloadManager>) {
        self.hls.spawn_reaper();
        let watch = Arc::clone(self);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(FORGET_EVERY).await;
                let ledger = Arc::clone(&downloads);
                let held = watch.held_downloads();
                let gone = kroma_module_sdk::host::blocking(move || {
                    Ok(ledger.no_longer_held(held.into_iter().collect()))
                })
                .await
                .unwrap_or_default();
                watch.forget(&gone);
            }
        });
    }

    fn held_downloads(&self) -> HashSet<String> {
        let mut held: HashSet<String> = self.probes.downloads();
        held.extend(self.vtts.downloads());
        held.extend(self.boards.downloads());
        held
    }

    fn forget(&self, downloads: &HashSet<String>) {
        if downloads.is_empty() {
            return;
        }
        self.probes.forget(downloads);
        self.vtts.forget(downloads);
        self.boards.forget(downloads);
        for download in downloads {
            tracing::debug!(
                download,
                "forgot what this engine held of a download that is gone"
            );
        }
    }

    fn scratch_for(&self, watched: &WatchedFile) -> PathBuf {
        self.scratch
            .join(format!("{}.{}", watched.download, watched.file))
    }
}

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    listing::routes::<S>()
        .merge(start::routes::<S>())
        .merge(probe::routes::<S>())
        .merge(hls::routes::<S>())
        .merge(subtitles::routes::<S>())
        .merge(storyboard::routes::<S>())
}

fn manager<S: HostStorage>(state: &S) -> Result<Arc<DownloadManager>, Response> {
    service::<DownloadManager>(state).ok_or_else(|| {
        json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "the download engine is not running yet",
        )
    })
}

fn engine<S: HostStorage>(state: &S) -> Result<Arc<Watch>, Response> {
    service::<Watch>(state).ok_or_else(|| {
        json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "this build serves no playlist of its own",
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    use kroma_module_sdk::domain::User;
    use kroma_module_sdk::host::testing::StubHost;

    use crate::downloads::test_support::{added, manager_over};
    use test_support::{call, member, watch_engine, watcher, BEARER};

    const BEARER_ROUTES: [(&str, &str); 6] = [
        ("GET", "/watch"),
        ("DELETE", "/watch/d1"),
        ("GET", "/watch/d1/files/0/progress"),
        ("POST", "/watch/d1/files/0/ticket"),
        ("GET", "/watch/d1/files/0/probe"),
        ("GET", "/watch/d1/files/0/storyboard"),
    ];

    fn served(tag: &str, viewer: User) -> StubHost {
        let (host, downloads) = manager_over(tag, &[added("d1")]);
        let engine = watch_engine(&host);
        host.with_gates_enforced()
            .with_session(BEARER, viewer)
            .with_service(downloads)
            .with_service(engine)
    }

    #[tokio::test]
    async fn no_watch_route_answers_an_account_that_may_not_play_a_download() {
        let host = served("watch-ungranted", member());

        for (method, path) in BEARER_ROUTES {
            let (status, _) = call(routes(), host.clone(), method, path).await;
            assert_eq!(status, StatusCode::FORBIDDEN, "{method} {path}");
        }
    }

    #[tokio::test]
    async fn the_listing_answers_an_account_granted_the_right() {
        let host = served("watch-granted", watcher());

        let (status, listed) = call(routes(), host, "GET", "/watch").await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(listed["entries"], serde_json::json!([]));
    }
}
