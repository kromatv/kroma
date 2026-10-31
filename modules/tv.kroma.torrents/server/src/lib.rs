//! Torrent download engines behind one [`DownloadClient`] trait, so the
//! server's DownloadManager is engine-agnostic: the embedded librqbit session
//! (feature `rqbit`), a Transmission daemon (RPC over curl) and a qBittorrent
//! WebUI (cookie auth over curl) all look the same.

#![allow(clippy::result_large_err)]

#[cfg(feature = "rqbit")]
mod announce;
pub mod bandwidth;
pub mod db;
pub mod downloads;
pub mod dtos;
pub mod module;
pub mod organize;
pub mod port;
pub mod proxycheck;
pub mod routes;
#[cfg(feature = "rqbit")]
mod rqbit;
#[cfg(not(feature = "rqbit"))]
#[path = "rqbit_stub.rs"]
mod rqbit;
#[cfg(feature = "rqbit")]
mod rqbit_session;
#[cfg(test)]
pub(crate) mod test_support;
pub mod torrent_file;
pub(crate) mod zero_as_none;

pub use dtos::*;
pub use module::MODULE;
pub use rqbit::{RqbitConfig, RqbitEngine};
#[cfg(feature = "rqbit")]
pub use announce::tracker_peers as announce_peers;
pub use db::{requests_with_active_downloads, ActiveDownload};
pub use downloads::{active_proxy_url, DownloadDb, DownloadManager, GrabSpec, LABEL};

pub const RQBIT_COMPILED: bool = cfg!(feature = "rqbit");

pub const MODULE_ID: &str = "tv.kroma.torrents";

/// The Downloads module's backend behavior: it serves the queue / download-client
/// / organize admin routes (behind its enabled-gate) and drives the librqbit
/// engine lifecycle, so disabling it 404s those routes and stops the running
/// engine.
pub struct DownloadsModule;

#[kroma_module_sdk::host::async_trait]
impl<S: kroma_module_sdk::host::HostStorage + Clone + Send + Sync + 'static>
    kroma_module_sdk::host::ServerModule<S> for DownloadsModule
{
    fn id(&self) -> &'static str {
        MODULE_ID
    }

    fn migrations(&self) -> &'static str {
        db::MIGRATIONS
    }

    fn admin_routes(&self, _host: &S) -> Option<axum::Router<S>> {
        Some(routes::routes::<S>())
    }

    async fn on_enable(&self, host: S) {
        let Some(downloads) = kroma_module_sdk::host::service::<DownloadManager>(&host) else {
            return;
        };
        downloads.seed_embedded_client();
        downloads.ensure_monitor(std::sync::Arc::new(host.clone()));
        // Detached, because the host does not serve a route until every module
        // has finished enabling and starting the engine is NETWORK work: a
        // restored magnet with no peers sits in the DHT for minutes, and
        // awaiting it here held the whole module's API at 502 for that long.
        tokio::spawn(async move {
            downloads.ensure_rqbit(&host).await;
            downloads.resume_after_enable();
        });
    }

    async fn on_disable(&self, host: S) {
        if let Some(downloads) = kroma_module_sdk::host::service::<DownloadManager>(&host) {
            downloads.disable_embedded();
        }
    }
}

/// This module's backend behavior, for the host's generic module roster.
pub fn server_module<S: kroma_module_sdk::host::HostStorage + Clone + Send + Sync + 'static>(
) -> Box<dyn kroma_module_sdk::host::ServerModule<S>> {
    Box::new(DownloadsModule)
}

pub mod engine;
pub use dtos::VpnStatusView;
pub use engine::{
    magnet_info_hash, AddTorrentReq, ClientDef, DownloadClient, TorrentFileEntry, TorrentState,
    TorrentStatus,
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_magnet_info_hash() {
        let m = "magnet:?xt=urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF01&dn=Thing&tr=udp://x";
        assert_eq!(
            magnet_info_hash(m).as_deref(),
            Some("abcdef0123456789abcdef0123456789abcdef01")
        );
        assert_eq!(magnet_info_hash("magnet:?xt=urn:btih:short"), None);
        assert_eq!(magnet_info_hash("https://example.com/file.torrent"), None);
    }

    #[test]
    fn this_module_answers_only_for_the_embedded_engine() {
        assert_eq!(engine::EMBEDDED_KIND, "rqbit");
        assert_eq!(engine::remote::DOWNLOAD_CLIENT, "tv.kroma.torrents/client");
    }

    type BareHost = kroma_module_sdk::host::testing::StubHost;

    #[test]
    fn the_module_declares_its_id_migrations_and_admin_routes() {
        let module = server_module::<BareHost>();
        assert_eq!(module.id(), MODULE_ID);
        assert_eq!(module.migrations(), db::MIGRATIONS);
        assert!(!db::MIGRATIONS.trim().is_empty());
        assert!(module.admin_routes(&BareHost::new()).is_some());
    }

    #[test]
    fn enabling_without_a_download_manager_is_a_no_op_rather_than_a_panic() {
        let module = server_module::<BareHost>();
        let rt = tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap();
        rt.block_on(async {
            let host = BareHost::new();
            module.on_enable(host.clone()).await;
            module.on_disable(host).await;
        });
    }
}
