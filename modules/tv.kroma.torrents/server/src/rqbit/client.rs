use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, bail, Result};
use librqbit::api::TorrentIdOrHash;
use librqbit::{AddTorrent, AddTorrentOptions, AddTorrentResponse};

use super::{ManagedTorrentHandle, RqbitEngine, METADATA_DEADLINE};
use crate::{AddTorrentReq, DownloadClient, TorrentState, TorrentStatus};

pub(crate) struct RqbitClient {
    pub(super) engine: Arc<RqbitEngine>,
}

// librqbit `Speed.mbps` is MiB/s (bytes / 1024 / 1024).
fn mib_to_bytes(mbps: f64) -> u64 {
    (mbps * 1024.0 * 1024.0).max(0.0) as u64
}

fn status_of(handle: &ManagedTorrentHandle, selection_held: bool) -> TorrentStatus {
    use librqbit::TorrentStatsState as S;
    let stats = handle.stats();
    let (have, size) = measured(handle, &stats);
    let progress = if size > 0 {
        have as f64 / size as f64
    } else {
        0.0
    };
    let done = stats.finished && !selection_held;
    let state = match stats.state {
        S::Initializing => TorrentState::Queued,
        S::Paused if done => TorrentState::Completed,
        S::Paused => TorrentState::Paused,
        S::Error => TorrentState::Error,
        S::Live if done => TorrentState::Seeding,
        S::Live => TorrentState::Downloading,
    };
    let (down_bps, up_bps) = stats
        .live
        .as_ref()
        .map(|l| {
            (
                mib_to_bytes(l.download_speed.mbps),
                mib_to_bytes(l.upload_speed.mbps),
            )
        })
        .unwrap_or((0, 0));
    let (peers, peers_seen) = stats
        .live
        .as_ref()
        .map(|l| (l.snapshot.peer_stats.live, l.snapshot.peer_stats.seen))
        .unwrap_or((0, 0));
    let metadata = handle.metadata.load();
    let files = metadata
        .as_ref()
        .map(|m| {
            m.file_infos
                .iter()
                .map(|f| f.relative_filename.to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    TorrentStatus {
        client_ref: handle.info_hash().as_string(),
        name: handle.name().unwrap_or_default(),
        info_hash: Some(handle.info_hash().as_string()),
        progress,
        state,
        down_bps,
        up_bps,
        peers,
        peers_seen,
        size_bytes: size,
        // The manager sets an explicit per-download output folder at add time
        // and remembers it; the engine reports none.
        save_path: None,
        files,
        error: stats.error,
        lifetime_downloaded_bytes: have,
        lifetime_uploaded_bytes: stats.uploaded_bytes,
    }
}

// A torrent whose selection is held empty reports nothing selected, which reads
// as no size, no progress and nothing left to download. The whole torrent is the
// measure until its files are chosen again.
fn measured(handle: &ManagedTorrentHandle, stats: &librqbit::TorrentStats) -> (u64, u64) {
    match stats.total_bytes {
        0 => (
            stats.file_progress.iter().sum(),
            handle
                .metadata
                .load()
                .as_ref()
                .map(|m| m.info.lengths().total_length())
                .unwrap_or_default(),
        ),
        size => (stats.progress_bytes, size),
    }
}

impl DownloadClient for RqbitClient {
    fn kind(&self) -> &'static str {
        "rqbit"
    }

    fn test(&self) -> Result<String> {
        Ok(format!("librqbit {} (embedded)", "9"))
    }

    fn add(&self, req: &AddTorrentReq) -> Result<String> {
        let engine = &self.engine;
        // Seed the swarm ourselves: behind the VPN, librqbit's reqwest tracker
        // client can't traverse the SOCKS bridge, so its own announce finds
        // nothing.
        let initial_peers = req.torrent_bytes.map(|bytes| {
            let peers = crate::announce::tracker_peers(bytes, engine.socks_proxy.as_deref());
            if !peers.is_empty() {
                let v6 = peers.iter().filter(|p| p.is_ipv6()).count();
                tracing::info!(
                    total = peers.len(),
                    ipv6 = v6,
                    "seeded torrent with peers from our proxied tracker announce"
                );
            }
            peers
        });
        let opts = AddTorrentOptions {
            output_folder: req.download_dir.map(str::to_string),
            overwrite: true,
            only_files: req.only_files.map(<[usize]>::to_vec),
            initial_peers: initial_peers.filter(|p| !p.is_empty()),
            ..Default::default()
        };
        let magnet_or_url = req.magnet_or_url.to_string();
        let add = match req.torrent_bytes {
            Some(bytes) => AddTorrent::from_bytes(bytes.to_vec()),
            None => AddTorrent::from_url(&magnet_or_url),
        };
        let response = engine.handle.block_on(async {
            tokio::time::timeout(
                Duration::from_secs(120),
                engine.session().add_torrent(add, Some(opts)),
            )
            .await
            .map_err(|_| anyhow!("timed out adding torrent (magnet resolve slow?)"))?
        })?;
        match response {
            AddTorrentResponse::Added(_, handle)
            | AddTorrentResponse::AlreadyManaged(_, handle) => Ok(handle.info_hash().as_string()),
            AddTorrentResponse::ListOnly(_) => bail!("unexpected list-only add response"),
        }
    }

    fn list_files(
        &self,
        magnet_or_url: &str,
        torrent_bytes: Option<&[u8]>,
    ) -> Result<Vec<crate::TorrentFileEntry>> {
        let engine = &self.engine;
        let opts = AddTorrentOptions {
            list_only: true,
            ..Default::default()
        };
        let url = magnet_or_url.to_string();
        let add = match torrent_bytes {
            Some(bytes) => AddTorrent::from_bytes(bytes.to_vec()),
            None => AddTorrent::from_url(&url),
        };
        let response = engine.handle.block_on(async {
            tokio::time::timeout(
                METADATA_DEADLINE,
                engine.session().add_torrent(add, Some(opts)),
            )
            .await
            .map_err(|_| anyhow!("no peer answered with this torrent's file list in time"))?
        })?;
        let info = match response {
            AddTorrentResponse::ListOnly(resp) => resp.info,
            AddTorrentResponse::Added(_, h) | AddTorrentResponse::AlreadyManaged(_, h) => h
                .metadata
                .load()
                .as_ref()
                .map(|m| m.info.clone())
                .ok_or_else(|| {
                    anyhow!("torrent already added but its metadata is not resolved yet")
                })?,
        };
        let mut out = Vec::new();
        for (index, file) in info.iter_file_details().enumerate() {
            out.push(crate::TorrentFileEntry {
                index,
                path: file.filename.to_pathbuf().to_string_lossy().into_owned(),
                size_bytes: file.len,
            });
        }
        Ok(out)
    }

    fn status(&self, client_ref: &str) -> Result<Option<TorrentStatus>> {
        match TorrentIdOrHash::parse(client_ref)
            .ok()
            .and_then(|id| self.engine.session().get(id))
        {
            Some(handle) => Ok(Some(status_of(
                &handle,
                self.engine.selection_held(client_ref),
            ))),
            None => Ok(None),
        }
    }

    fn pause(&self, client_ref: &str) -> Result<()> {
        let handle = self.engine.find(client_ref)?;
        self.engine
            .handle
            .block_on(self.engine.session().pause(&handle))
    }

    fn resume(&self, client_ref: &str) -> Result<()> {
        let handle = self.engine.find(client_ref)?;
        self.engine
            .handle
            .block_on(self.engine.session().unpause(&handle))
    }

    fn reannounce(&self, client_ref: &str) -> Result<()> {
        // librqbit exposes no force-announce; a pause->unpause cycle rebuilds
        // the live task, which re-announces to every tracker immediately (the
        // recovery lever for a peer-starved torrent stuck at 0%).
        let handle = self.engine.find(client_ref)?;
        if matches!(handle.stats().state, librqbit::TorrentStatsState::Paused) {
            return Ok(()); // deliberately paused: don't resurrect it
        }
        self.engine.handle.block_on(async {
            self.engine.session().pause(&handle).await?;
            self.engine.session().unpause(&handle).await
        })
    }

    fn remove(&self, client_ref: &str, delete_data: bool) -> Result<()> {
        let id = TorrentIdOrHash::parse(client_ref)
            .map_err(|e| anyhow!("bad torrent ref {client_ref:?}: {e:#}"))?;
        self.engine
            .handle
            .block_on(self.engine.session().delete(id, delete_data))
    }
}
