//! The embedded BitTorrent engine: the upstream `rqbit` server as a helper program
//! the host starts, driven over its HTTP API so the sync [`DownloadClient`] trait
//! can use it. Torrents are identified by their info-hash hex, stable across
//! restarts, and rqbit's own persistence carries them over a restart of the module.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow, bail};
use kroma_module_sdk::host::process::{self, Child, Command};
use kroma_module_sdk::host::run_blocking;
use kroma_module_sdk::http::egress::BLOCKED;

use crate::DownloadClient;

mod adding;
mod api;
mod client;
mod command;
pub(crate) mod ports;
mod rate_limits;
mod snapshot;
#[cfg(test)]
pub(crate) mod test_support;
mod wire;

use adding::Adding;
pub use adding::StillAdding;
use api::Api;

pub const PROGRAM: &str = "rqbit";

const START_DEADLINE: Duration = Duration::from_secs(300);
const FIRST_PROBE_PAUSE: Duration = Duration::from_millis(100);
const LONGEST_PROBE_PAUSE: Duration = Duration::from_secs(2);
const STOP_GRACE: Duration = Duration::from_secs(6);
const STOP_POLL: Duration = Duration::from_millis(100);
const OUTPUT_TAIL_BYTES: u32 = 4096;

#[derive(Debug, Clone, Default)]
pub struct RqbitConfig {
    pub program: String,
    pub session_dir: PathBuf,
    pub download_dir: PathBuf,
    pub work_dir: PathBuf,
    pub socks_proxy_url: Option<String>,
    pub sealed: bool,
    pub api_port: u16,
    pub listen_port: u16,
    pub download_bps: Option<u32>,
    pub upload_bps: Option<u32>,
}

pub struct RqbitEngine {
    child: Child,
    api: Api,
    adding: Adding,
    started: Instant,
    sealed: bool,
    socks_proxy: Option<String>,
    version: String,
    peer_id: [u8; 20],
    snapshot: Mutex<Option<snapshot::Snapshot>>,
    files: Mutex<HashMap<String, Vec<String>>>,
    limits: Mutex<(Option<u32>, Option<u32>)>,
}

fn fresh_peer_id() -> [u8; 20] {
    let mut id = *b"-rQ9100-000000000000";
    let random = kroma_module_sdk::primitives::random_token();
    id[8..].copy_from_slice(&random.as_bytes()[..12]);
    id
}

fn wanted_limits(download_bps: Option<u32>, upload_bps: Option<u32>) -> (Option<u32>, Option<u32>) {
    (
        download_bps.filter(|bps| *bps > 0),
        upload_bps.filter(|bps| *bps > 0),
    )
}

impl RqbitEngine {
    /// Fetch the helper if it is not here yet, start it, and wait for its API. A
    /// session that takes a while to restore only makes this wait: other work
    /// runs in the meantime.
    pub async fn start(cfg: &RqbitConfig) -> Result<Arc<RqbitEngine>> {
        std::fs::create_dir_all(&cfg.download_dir).ok();
        std::fs::create_dir_all(&cfg.session_dir).ok();
        let dropped = crate::rqbit_session::prune_unrestorable(&cfg.session_dir);
        if dropped > 0 {
            tracing::info!(
                dropped,
                "dropped persisted torrents with no metadata on disk; the ledger re-adds them"
            );
        }
        let program = cfg.program.clone();
        run_blocking(move || process::ensure(&program))
            .await
            .map_err(|error| anyhow!("{error}"))?
            .map_err(|reason| anyhow!(reason))
            .context("fetch the rqbit helper")?;

        let password = kroma_module_sdk::primitives::random_token();
        let mut helper = Command::new(cfg.program.clone())
            .args(command::arguments(cfg))
            .env(api::AUTH_ENV, api::user_pass(&password));
        for (name, value) in command::environment(cfg) {
            helper = helper.env(name, value);
        }
        let child = helper
            .spawn()
            .map_err(|reason| anyhow!(reason))
            .context("start rqbit")?;
        let api = Api::new(cfg.api_port, &password);
        let version = match until_answering(&child, &api).await {
            Ok(version) => version,
            Err(error) => {
                child.kill();
                return Err(error);
            }
        };
        Ok(Self::attached(child, api, version, cfg))
    }

    fn attached(child: Child, api: Api, version: String, cfg: &RqbitConfig) -> Arc<Self> {
        Arc::new(Self {
            child,
            adding: Adding::new(api.clone(), cfg.work_dir.clone()),
            api,
            started: Instant::now(),
            sealed: cfg.sealed,
            socks_proxy: cfg.socks_proxy_url.clone(),
            version,
            peer_id: fresh_peer_id(),
            snapshot: Mutex::new(None),
            files: Mutex::new(HashMap::new()),
            limits: Mutex::new(wanted_limits(cfg.download_bps, cfg.upload_bps)),
        })
    }

    /// Whether the session dials through the VPN, with every other peer source off.
    pub fn is_sealed(&self) -> bool {
        self.sealed
    }

    /// The exit code once the helper has ended on its own.
    pub fn exited(&self) -> Option<i32> {
        self.child.try_wait().unwrap_or(Some(-1))
    }

    /// How long this helper has been up.
    pub fn uptime(&self) -> Duration {
        self.started.elapsed()
    }

    /// What the helper last said about itself, with no credential in it.
    pub fn last_words(&self) -> String {
        output_tail(&self.child)
    }

    /// Peers from our own announce through the VPN, for a `.torrent` or else a
    /// magnet. Empty unless sealed, where the session's trackers run.
    pub fn proxied_peers(&self, torrent_bytes: Option<&[u8]>, magnet: &str) -> Vec<SocketAddr> {
        let Some(proxy) = self.socks_proxy.as_deref().filter(|_| self.sealed) else {
            return Vec::new();
        };
        match torrent_bytes {
            Some(bytes) => crate::announce::tracker_peers(bytes, proxy, &self.peer_id),
            None => crate::announce::magnet_peers(magnet, proxy, &self.peer_id),
        }
    }

    /// Ask the helper to end and drop what it was doing, without waiting. A
    /// replacement must use [`Self::shutdown`] instead: both would write the same
    /// persistence directory.
    pub fn stop(&self) {
        self.adding.cancel_all();
        self.child.terminate();
    }

    /// End the helper and wait until it has, so the next one can open the same
    /// persistence directory and port.
    pub async fn shutdown(&self) {
        self.stop();
        let deadline = Instant::now() + STOP_GRACE;
        while Instant::now() < deadline {
            if self.exited().is_some() {
                return;
            }
            tokio::time::sleep(STOP_POLL).await;
        }
        self.child.kill();
    }

    pub fn client(self: &Arc<Self>) -> Box<dyn DownloadClient> {
        Box::new(client::RqbitClient {
            engine: self.clone(),
        })
    }

    /// Drop a magnet still being added, and the torrent if it just landed. The
    /// row that asked for it has gone or been paused.
    pub fn cancel_add(&self, link: &str) {
        self.adding.cancel(link);
    }

    /// Hand a stalled torrent peers from our own proxied tracker announce.
    pub fn add_peers(&self, client_ref: &str, peers: &[SocketAddr]) -> Result<usize> {
        self.api.add_peers(client_ref, peers)
    }
}

async fn until_answering(child: &Child, api: &Api) -> Result<String> {
    let deadline = Instant::now() + START_DEADLINE;
    let mut pause = FIRST_PROBE_PAUSE;
    loop {
        if let Some(code) = child.try_wait().map_err(|reason| anyhow!(reason))? {
            bail!(
                "rqbit exited with code {code} before it answered: {}",
                output_tail(child)
            );
        }
        let probe = api.clone();
        let answer = run_blocking(move || probe.version())
            .await
            .map_err(|error| anyhow!("{error}"))?;
        match answer {
            Ok(version) => return Ok(version),
            Err(error) if format!("{error:#}").contains(BLOCKED) => {
                return Err(error.context("the network rules refuse this module its own engine"));
            }
            Err(_) if Instant::now() >= deadline => {
                bail!("rqbit did not answer within {START_DEADLINE:?}");
            }
            Err(_) => {}
        }
        tokio::time::sleep(pause).await;
        pause = (pause * 2).min(LONGEST_PROBE_PAUSE);
    }
}

fn output_tail(child: &Child) -> String {
    let stderr = child.read_stderr(OUTPUT_TAIL_BYTES);
    let stdout = child.read_stdout(OUTPUT_TAIL_BYTES);
    let text =
        String::from_utf8_lossy(if stderr.is_empty() { &stdout } else { &stderr }).into_owned();
    text.lines()
        .filter(|line| !line.contains("socks5"))
        .map(without_colors)
        .collect::<Vec<_>>()
        .join(" | ")
}

fn without_colors(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut escaped = false;
    for c in line.chars() {
        match (escaped, c) {
            (false, '\u{1b}') => escaped = true,
            (false, _) => out.push(c),
            (true, 'm') => escaped = false,
            (true, _) => {}
        }
    }
    out
}

#[cfg(test)]
mod tests;
