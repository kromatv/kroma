//! The Acquisition module as a standalone process (its `.kmod` entrypoint).
//!
//! Serves its admin routes and contributes the search / import / match passes
//! as [`ServerModule::jobs`](kroma_module_sdk::host::ServerModule::jobs),
//! reachable via `/_job/run/{key}`. Consumes `DownloadGrabPort` +
//! `DownloadDbPort` (Downloads sidecar) and `IndexerDbPort` +
//! `IndexerSearchPort` (Indexers sidecar); provides no ports.

use std::sync::Arc;

use kroma_module_runtime::RemoteHost;
use kroma_module_sdk::ports::{
    DownloadDbPort, DownloadGrabPort, IndexerDbPort, IndexerSearchPort,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    kroma_module_runtime::serve(
        move |host| {
            let grab: Arc<dyn DownloadGrabPort> = Arc::new(kroma_port_bridge::DownloadGrabClient::new(
                host.sibling_resolver("tv.kroma.torrents"),
            ));
            host.register_port(grab);
            let ledger: Arc<dyn DownloadDbPort> = Arc::new(kroma_port_bridge::DownloadDbClient::new(
                host.sibling_resolver("tv.kroma.torrents"),
            ));
            host.register_port(ledger);
            let idb: Arc<dyn IndexerDbPort> = Arc::new(kroma_port_bridge::IndexerDbClient::new(
                host.sibling_resolver("tv.kroma.indexer"),
            ));
            host.register_port(idb);
            let isearch: Arc<dyn IndexerSearchPort> =
                Arc::new(kroma_port_bridge::IndexerSearchClient::new(
                    host.sibling_resolver("tv.kroma.indexer"),
                ));
            host.register_port(isearch);
        },
        vec![kroma_acquisition::server_module::<RemoteHost>()],
        // Provider routes for the core's /api/requests/:id/search + /grab endpoints.
        kroma_acquisition::acqsearch_routes::<RemoteHost>(),
    )
    .await
}
