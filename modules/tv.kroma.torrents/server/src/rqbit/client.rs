use std::sync::Arc;

use anyhow::{Result, anyhow, bail};

use super::RqbitEngine;
use super::adding::StillAdding;
use super::api::AddOptions;
use super::wire::Listed;
use crate::{AddTorrentReq, DownloadClient, TorrentState, TorrentStatus};

const CURL_TIMED_OUT: &str = "curl exit 28";

pub(crate) struct RqbitClient {
    pub(super) engine: Arc<RqbitEngine>,
}

fn mib_to_bytes(mbps: f64) -> u64 {
    (mbps * 1024.0 * 1024.0).max(0.0) as u64
}

fn state_of(listed: &Listed) -> TorrentState {
    let stats = listed.stats.as_ref();
    let done = stats.is_some_and(|stats| stats.finished);
    match stats.map_or("", |stats| stats.state.as_str()) {
        "paused" if done => TorrentState::Completed,
        "paused" => TorrentState::Paused,
        "error" => TorrentState::Error,
        "live" if done => TorrentState::Seeding,
        "live" => TorrentState::Downloading,
        _ => TorrentState::Queued,
    }
}

fn status_of(listed: &Listed, files: Vec<String>) -> TorrentStatus {
    let stats = listed.stats.clone().unwrap_or_default();
    let live = stats.live.clone().unwrap_or_default();
    let progress = if stats.total_bytes > 0 {
        stats.progress_bytes as f64 / stats.total_bytes as f64
    } else {
        0.0
    };
    TorrentStatus {
        client_ref: listed.info_hash.clone(),
        name: listed.name.clone().unwrap_or_default(),
        info_hash: Some(listed.info_hash.clone()),
        progress,
        state: state_of(listed),
        down_bps: mib_to_bytes(live.download_speed.mbps),
        up_bps: mib_to_bytes(live.upload_speed.mbps),
        peers: live.snapshot.peer_stats.live,
        peers_seen: live.snapshot.peer_stats.seen,
        size_bytes: stats.total_bytes,
        save_path: None,
        files,
        error: stats.error,
        lifetime_downloaded_bytes: stats.progress_bytes,
        lifetime_uploaded_bytes: stats.uploaded_bytes,
    }
}

impl DownloadClient for RqbitClient {
    fn kind(&self) -> &'static str {
        "rqbit"
    }

    fn test(&self) -> Result<String> {
        Ok(format!("rqbit {} (helper)", self.engine.version))
    }

    fn add(&self, req: &AddTorrentReq) -> Result<String> {
        let engine = &self.engine;
        refuse_unsealed_fetch(engine, req.torrent_bytes, req.magnet_or_url)?;
        let added = match req.torrent_bytes {
            Some(bytes) => add_bytes(engine, bytes, req),
            None => add_link(engine, req),
        };
        engine.forget_snapshot();
        added
    }

    fn list_files(
        &self,
        magnet_or_url: &str,
        torrent_bytes: Option<&[u8]>,
    ) -> Result<Vec<crate::TorrentFileEntry>> {
        let engine = &self.engine;
        refuse_unsealed_fetch(engine, torrent_bytes, magnet_or_url)?;
        let initial_peers = engine.proxied_peers(torrent_bytes, magnet_or_url);
        let options = AddOptions {
            list_only: true,
            is_url: torrent_bytes.is_none(),
            initial_peers: &initial_peers,
            ..AddOptions::default()
        };
        let body = torrent_bytes.unwrap_or(magnet_or_url.as_bytes());
        let added = engine.api.add(body, &options).map_err(|error| {
            if format!("{error:#}").contains(CURL_TIMED_OUT) {
                anyhow!("no peer answered with this torrent's file list in time")
            } else {
                error
            }
        })?;
        Ok(added
            .details
            .files
            .unwrap_or_default()
            .iter()
            .enumerate()
            .map(|(index, file)| crate::TorrentFileEntry {
                index,
                path: file.path(),
                size_bytes: file.length,
            })
            .collect())
    }

    fn status(&self, client_ref: &str) -> Result<Option<TorrentStatus>> {
        let Some(listed) = self.engine.listed(client_ref)? else {
            return Ok(None);
        };
        let files = self.engine.files_of(client_ref)?;
        Ok(Some(status_of(&listed, files)))
    }

    fn pause(&self, client_ref: &str) -> Result<()> {
        self.engine.forget_snapshot();
        self.engine.api.pause(client_ref)
    }

    fn resume(&self, client_ref: &str) -> Result<()> {
        self.engine.forget_snapshot();
        self.engine.api.start(client_ref)
    }

    fn reannounce(&self, client_ref: &str) -> Result<()> {
        let listed = self.engine.listed(client_ref)?;
        let paused = listed
            .and_then(|listed| listed.stats)
            .is_some_and(|stats| stats.state == "paused");
        if paused {
            return Ok(());
        }
        self.engine.forget_snapshot();
        self.engine.api.pause(client_ref)?;
        self.engine.api.start(client_ref)
    }

    fn remove(&self, client_ref: &str, delete_data: bool) -> Result<()> {
        self.engine.forget_snapshot();
        self.engine.forget_files(client_ref);
        if delete_data {
            self.engine.api.delete(client_ref)
        } else {
            self.engine.api.forget(client_ref)
        }
    }
}

fn add_bytes(engine: &RqbitEngine, bytes: &[u8], req: &AddTorrentReq) -> Result<String> {
    let initial_peers = engine.proxied_peers(Some(bytes), req.magnet_or_url);
    if !initial_peers.is_empty() {
        let v6 = initial_peers.iter().filter(|peer| peer.is_ipv6()).count();
        tracing::info!(
            total = initial_peers.len(),
            ipv6 = v6,
            "seeded torrent with peers from our proxied tracker announce"
        );
    }
    let options = AddOptions {
        output_folder: req.download_dir,
        only_files: req.only_files,
        initial_peers: &initial_peers,
        ..AddOptions::default()
    };
    Ok(engine.api.add(bytes, &options)?.details.info_hash)
}

fn add_link(engine: &RqbitEngine, req: &AddTorrentReq) -> Result<String> {
    let link = req.magnet_or_url;
    if let Some(answer) = engine.adding.poll(link) {
        return answer;
    }
    let known = crate::magnet::parse(link).and_then(|magnet| magnet.hex_hash());
    if let Some(hash) = known {
        if engine.api.holds(&hash)? {
            return Ok(hash);
        }
    }
    let initial_peers = engine.proxied_peers(None, link);
    engine.adding.start(
        link,
        &AddOptions {
            output_folder: req.download_dir,
            only_files: req.only_files,
            initial_peers: &initial_peers,
            is_url: true,
            ..AddOptions::default()
        },
    )?;
    Err(StillAdding.into())
}

fn refuse_unsealed_fetch(
    engine: &RqbitEngine,
    torrent_bytes: Option<&[u8]>,
    magnet_or_url: &str,
) -> Result<()> {
    if engine.is_sealed() && torrent_bytes.is_none() && !magnet_or_url.starts_with("magnet:") {
        bail!("behind the VPN the engine takes a .torrent file or a magnet, not a URL to fetch");
    }
    Ok(())
}

#[cfg(test)]
mod tests;
