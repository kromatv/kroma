use std::sync::Arc;

use kroma_module_sdk::host::testing::StubHost;
use kroma_module_sdk::host::{HostCtx as _, HostStorage as _};

use crate::db::{self, DownloadRow};
use crate::watch::WatchableFileView;

use super::DownloadManager;

pub(crate) fn manager_over(tag: &str, rows: &[DownloadRow]) -> (StubHost, Arc<DownloadManager>) {
    let host = StubHost::with_core(kroma_module_sdk::db::testing::temp_pool(tag));
    let store = host.store();
    db::apply_migrations(&store.get().unwrap(), db::MIGRATIONS).unwrap();
    db::insert_download_client(
        store,
        &db::test_support::client(db::EMBEDDED_CLIENT_ID, 100, true, 1),
    )
    .unwrap();
    for row in rows {
        db::insert_download(host.db(), row).unwrap();
    }
    let manager = restarted(&host);
    (host, manager)
}

pub(crate) fn restarted(host: &StubHost) -> Arc<DownloadManager> {
    DownloadManager::new(
        Arc::new(host.clone()),
        host.data_dir(),
        host.db().clone(),
        host.store().clone(),
    )
}

pub(crate) fn offering(manager: &DownloadManager, client_ref: &str, videos: &[usize]) {
    let files: Vec<WatchableFileView> = videos
        .iter()
        .map(|&index| WatchableFileView {
            index,
            name: format!("E{index:02}.mkv"),
            size_bytes: 1024,
            is_video: true,
            season: None,
            episode: None,
        })
        .collect();
    manager
        .video_files
        .lock()
        .unwrap()
        .insert(client_ref.to_string(), files.into());
}

/// Stands in for a season pack whose file list the swarm has answered with: one
/// video file per episode, named as a pack names them.
pub(crate) fn offering_pack(
    manager: &DownloadManager,
    client_ref: &str,
    season: u32,
    episodes: &[u32],
) {
    let files: Vec<WatchableFileView> = episodes
        .iter()
        .enumerate()
        .map(|(index, &episode)| WatchableFileView {
            index,
            name: format!("Show.S{season:02}E{episode:02}.mkv"),
            size_bytes: 1024,
            is_video: true,
            season: Some(season),
            episode: Some(episode),
        })
        .collect();
    manager
        .video_files
        .lock()
        .unwrap()
        .insert(client_ref.to_string(), files.into());
}

pub(crate) fn added(id: &str) -> DownloadRow {
    DownloadRow {
        client_ref: "deadbeef".into(),
        ..db::test_support::download(id, "downloading", 1)
    }
}
