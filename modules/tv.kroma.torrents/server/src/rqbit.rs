//! The embedded BitTorrent engine: a librqbit `Session` wrapped so the sync
//! [`DownloadClient`] trait can drive it. Torrents are identified by their
//! info-hash hex, stable across restarts.

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use librqbit::api::{Api, TorrentIdOrHash};
use librqbit::limits::LimitsConfig;
use librqbit::{
    AddTorrent, AddTorrentOptions, ConnectionOptions, DhtSessionConfig, ListenerMode,
    ListenerOptions, ManagedTorrent, Session, SessionOptions, SessionPersistenceConfig,
};

type ManagedTorrentHandle = Arc<ManagedTorrent>;

use crate::DownloadClient;

mod client;
mod rate_limits;
mod stream;
mod warm;

// Shorter than the 30s a caller reaching this over the module bridge waits, so
// the answer is always OURS: a caller that gives up first reports a transport
// failure, which says nothing about the torrent.
const METADATA_DEADLINE: Duration = Duration::from_secs(25);

#[derive(Debug, Clone, Default)]
pub struct RqbitConfig {
    pub session_dir: PathBuf,
    pub download_dir: PathBuf,
    pub socks_proxy_url: Option<String>,
    pub listen_port: Option<u16>,
    pub download_bps: Option<u32>,
    pub upload_bps: Option<u32>,
}

pub struct RqbitEngine {
    // The `Api` rather than the bare session, because the have-bitfield a
    // progress poll reads has no other public door.
    api: Api,
    handle: tokio::runtime::Handle,
    // The VPN socks5 the session dials through (if any), reused for our own
    // tracker announces so recovered peers are reachable from the same network.
    socks_proxy: Option<String>,
    held_selections: warm::Holds,
    warming: Mutex<HashSet<warm::ReadingFile>>,
}

impl RqbitEngine {
    /// Start (or restore, via fastresume) the embedded session. Must be called
    /// from within a tokio runtime.
    pub async fn start(cfg: &RqbitConfig) -> Result<Arc<RqbitEngine>> {
        std::fs::create_dir_all(&cfg.download_dir).ok();
        std::fs::create_dir_all(&cfg.session_dir).ok();
        // Before the session opens, because opening it is what waits on these.
        let dropped = crate::rqbit_session::prune_unrestorable(&cfg.session_dir);
        if dropped > 0 {
            tracing::info!(
                dropped,
                "dropped persisted torrents with no metadata on disk; the ledger re-adds them"
            );
        }
        let opts = SessionOptions {
            persistence: Some(SessionPersistenceConfig::Json {
                folder: Some(cfg.session_dir.clone()),
            }),
            fastresume: true,
            // Peer traffic dials through the SOCKS proxy when set (the VPN
            // seal); `None` = direct.
            connect: Some(ConnectionOptions {
                proxy_url: cfg.socks_proxy_url.clone(),
                ..Default::default()
            }),
            // TCP-only: uTP is UDP and can't traverse a TCP SOCKS5 tunnel, so
            // a VPN session must stay TCP-only regardless.
            listen: Some(ListenerOptions {
                mode: ListenerMode::TcpOnly,
                listen_addr: (
                    std::net::Ipv6Addr::UNSPECIFIED,
                    cfg.listen_port.unwrap_or(0),
                )
                    .into(),
                // A NAS behind the user's control: no surprise router reconfig.
                enable_upnp_port_forwarding: false,
                ..Default::default()
            }),
            ratelimits: LimitsConfig {
                download_bps: cfg.download_bps.and_then(std::num::NonZeroU32::new),
                upload_bps: cfg.upload_bps.and_then(std::num::NonZeroU32::new),
            },
            // DHT on, but ephemeral port + NO persistence: on a restart (e.g. a
            // VPN config change) a fixed persisted port collides with the
            // session still shutting down ("address already in use"). An
            // ephemeral port re-bootstraps in a few seconds.
            dht: Some(DhtSessionConfig {
                bootstrap_addrs: None,
                port: None,
                persistence: None,
            }),
            ..Default::default()
        };
        let session = Session::new_with_opts(cfg.download_dir.clone(), opts)
            .await
            .context("start embedded torrent session")?;
        Ok(Arc::new(RqbitEngine {
            api: Api::new(session, None),
            handle: tokio::runtime::Handle::current(),
            socks_proxy: cfg.socks_proxy_url.clone(),
            held_selections: warm::Holds::default(),
            warming: Mutex::new(HashSet::new()),
        }))
    }

    fn session(&self) -> &Arc<Session> {
        self.api.session()
    }

    /// Drain the session (stops all torrent activity) without waiting for it.
    /// A replacement session must use [`Self::shutdown`] instead: both would
    /// write the same persistence directory.
    pub fn stop(&self) {
        let session = self.session().clone();
        self.handle.spawn(async move { session.stop().await });
    }

    /// Drain the session and wait until it has stopped, so the next session can
    /// open the same persistence directory without racing this one's writes.
    pub async fn shutdown(&self) {
        self.session().stop().await;
    }

    pub fn client(self: &Arc<Self>) -> Box<dyn DownloadClient> {
        Box::new(client::RqbitClient {
            engine: self.clone(),
        })
    }

    fn find(&self, client_ref: &str) -> Result<ManagedTorrentHandle> {
        let id = TorrentIdOrHash::parse(client_ref)
            .map_err(|e| anyhow!("bad torrent ref {client_ref:?}: {e:#}"))?;
        self.session()
            .get(id)
            .ok_or_else(|| anyhow!("torrent {client_ref} not in session"))
    }

    /// Re-seed a stalled torrent with a fresh peer set (from our own proxied
    /// tracker announce). librqbit has no public API to push peers into a live
    /// torrent, and `initial_peers` is only honored on the FIRST add, so this
    /// removes the torrent (KEEPING its data on disk) and re-adds it seeded with
    /// the peers. Callers must serialize this against status polls
    /// (the monitor runs both on its one thread) so the brief remove window is
    /// never observed as "torrent disappeared".
    pub fn reseed(
        &self,
        client_ref: &str,
        torrent_bytes: Vec<u8>,
        output_folder: Option<&str>,
        peers: &[std::net::SocketAddr],
    ) -> Result<()> {
        let id = TorrentIdOrHash::parse(client_ref)
            .map_err(|e| anyhow!("bad torrent ref {client_ref:?}: {e:#}"))?;
        let output_folder = output_folder.map(str::to_string);
        let peers = peers.to_vec();
        self.handle.block_on(async {
            self.session().delete(id, false).await.ok();
            let opts = AddTorrentOptions {
                output_folder,
                // NOT overwrite: resume from whatever is already on disk (fastresume)
                // instead of truncating it - a reseed must never reset progress.
                overwrite: false,
                initial_peers: Some(peers),
                ..Default::default()
            };
            self.session()
                .add_torrent(AddTorrent::from_bytes(torrent_bytes), Some(opts))
                .await
                .map(|_| ())
        })
    }
}
