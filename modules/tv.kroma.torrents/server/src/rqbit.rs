//! The embedded BitTorrent engine: a librqbit `Session` wrapped so the sync
//! [`DownloadClient`] trait can drive it. Torrents are identified by their
//! info-hash hex, stable across restarts.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use librqbit::api::TorrentIdOrHash;
use librqbit::limits::LimitsConfig;
use librqbit::{
    AddTorrent, AddTorrentOptions, ConnectionOptions, DhtSessionConfig, ListenerMode,
    ListenerOptions, ManagedTorrent, Session, SessionOptions, SessionPersistenceConfig,
};
use librqbit_core::peer_id::generate_azereus_style;

type ManagedTorrentHandle = Arc<ManagedTorrent>;

use crate::DownloadClient;

mod client;
mod rate_limits;

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
    session: Arc<Session>,
    handle: tokio::runtime::Handle,
    // The VPN socks5 the session dials through (if any), reused for our own
    // tracker announces so recovered peers are reachable from the same network.
    socks_proxy: Option<String>,
    // Fresh at each start, so a tracker cannot link this session to the last.
    peer_id: [u8; 20],
}

fn session_options(cfg: &RqbitConfig) -> SessionOptions {
    let opts = SessionOptions {
        persistence: Some(SessionPersistenceConfig::Json {
            folder: Some(cfg.session_dir.clone()),
        }),
        fastresume: true,
        connect: Some(ConnectionOptions {
            proxy_url: cfg.socks_proxy_url.clone(),
            ..Default::default()
        }),
        // TCP-only: uTP is UDP and can't traverse a TCP SOCKS5 tunnel.
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
        // Ephemeral port, no persistence: a persisted port collides with the
        // session still shutting down on restart ("address already in use").
        dht: Some(DhtSessionConfig {
            bootstrap_addrs: None,
            port: None,
            persistence: None,
        }),
        ..Default::default()
    };
    if cfg.socks_proxy_url.is_none() {
        return opts;
    }
    // Only SOCKS-dialled TCP stays in the tunnel: DHT, UDP trackers, LSD, HTTP
    // trackers and a host listener all leave it, so `announce` feeds the peers.
    SessionOptions {
        dht: None,
        listen: None,
        disable_trackers: true,
        disable_local_service_discovery: true,
        ipv4_only: true,
        ..opts
    }
}

impl RqbitEngine {
    /// Start (or restore, via fastresume) the embedded session. Must be called
    /// from within a tokio runtime.
    pub async fn start(cfg: &RqbitConfig) -> Result<Arc<RqbitEngine>> {
        tokio::fs::create_dir_all(&cfg.download_dir).await.ok();
        tokio::fs::create_dir_all(&cfg.session_dir).await.ok();
        // Before the session opens, because opening it is what waits on these.
        let dropped = crate::rqbit_session::prune_unrestorable(&cfg.session_dir);
        if dropped > 0 {
            tracing::info!(
                dropped,
                "dropped persisted torrents with no metadata on disk; the ledger re-adds them"
            );
        }
        let peer_id = generate_azereus_style(*b"rQ", (9, 0, 0, 0));
        let opts = SessionOptions {
            peer_id: Some(peer_id),
            ..session_options(cfg)
        };
        let session = Session::new_with_opts(cfg.download_dir.clone(), opts)
            .await
            .context("start embedded torrent session")?;
        Ok(Arc::new(RqbitEngine {
            session,
            handle: tokio::runtime::Handle::current(),
            socks_proxy: cfg.socks_proxy_url.clone(),
            peer_id: peer_id.0,
        }))
    }

    fn session(&self) -> &Arc<Session> {
        &self.session
    }

    /// Whether the session dials through the VPN, with every other peer
    /// source off.
    pub fn is_sealed(&self) -> bool {
        self.socks_proxy.is_some()
    }

    /// Peers from our own announce through the VPN, for a `.torrent` or else a
    /// magnet. Empty without a proxy, where the session's trackers run.
    pub fn proxied_peers(
        &self,
        torrent_bytes: Option<&[u8]>,
        magnet: &str,
    ) -> Vec<std::net::SocketAddr> {
        let Some(proxy) = self.socks_proxy.as_deref() else {
            return Vec::new();
        };
        match torrent_bytes {
            Some(bytes) => crate::announce::tracker_peers(bytes, proxy, &self.peer_id),
            None => crate::announce::magnet_peers(magnet, proxy, &self.peer_id),
        }
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
                overwrite: true,
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

#[cfg(test)]
mod tests {
    use super::*;

    const BRIDGE: &str = "socks5://127.0.0.1:25345";

    #[test]
    fn behind_the_vpn_nothing_leaves_outside_the_socks_tunnel() {
        let opts = session_options(&RqbitConfig {
            socks_proxy_url: Some(BRIDGE.into()),
            listen_port: Some(51413),
            ..Default::default()
        });

        assert!(opts.dht.is_none());
        assert!(opts.listen.is_none());
        assert!(opts.disable_trackers);
        assert!(opts.disable_local_service_discovery);
        assert!(opts.ipv4_only);
        assert_eq!(opts.connect.unwrap().proxy_url.as_deref(), Some(BRIDGE));
    }

    #[test]
    fn without_a_vpn_the_engine_keeps_every_peer_source() {
        let opts = session_options(&RqbitConfig::default());

        assert!(opts.dht.is_some());
        assert!(opts.listen.is_some());
        assert!(!opts.disable_trackers);
        assert!(!opts.disable_local_service_discovery);
        assert!(opts.connect.unwrap().proxy_url.is_none());
    }
}
