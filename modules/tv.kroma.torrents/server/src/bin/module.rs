//! The Downloads module as a standalone process (its `.kmod` entrypoint).
//!
//! It defines the `download-client` point and answers it itself with the embedded
//! librqbit engine. Every other engine is its own sidecar answering the same point
//! under its own kind, resolved when a download needs one, so nothing here names
//! an engine.

use std::sync::Arc;

use kroma_module_runtime::RemoteHost;
use kroma_module_sdk::host::{HostCtx, HostStorage};
use kroma_torrent::DownloadManager;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let data_dir = std::path::PathBuf::from(std::env::var("KROMA_DATA_DIR")?);

    kroma_module_runtime::serve(
        move |host| {
            // Built here rather than before the call, because the manager holds
            // the two pools it answers out of (the shared ledger, and this
            // module's own file where the client credentials live) and the host it
            // resolves an engine through.
            let host_ref: Arc<dyn HostCtx> = Arc::new(host.clone());
            let downloads =
                DownloadManager::new(host_ref, &data_dir, host.db().clone(), host.store().clone());
            host.register_service(downloads.clone());

            // The points this module answers. What it CALLS is resolved at the
            // point of use, so nothing here names a peer.
            kroma_torrent::port::ledger::routes::<RemoteHost>()
                .merge(kroma_torrent::port::vpn::routes::<RemoteHost>())
                .merge(kroma_torrent::engine::remote::routes::<RemoteHost>())
        },
        vec![kroma_torrent::server_module::<RemoteHost>()],
    )
    .await
}
