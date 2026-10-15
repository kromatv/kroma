//! The Downloads module as a standalone process (its `.kmod` entrypoint).

use std::sync::Arc;

use kroma_module_runtime::RemoteHost;
use kroma_module_sdk::host::{HostCtx, HostStorage};
use kroma_torrent::DownloadManager;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let data_dir = std::path::PathBuf::from(std::env::var("KROMA_DATA_DIR")?);

    kroma_module_runtime::serve(
        move |host| {
            let host_ref: Arc<dyn HostCtx> = Arc::new(host.clone());
            let downloads =
                DownloadManager::new(host_ref, &data_dir, host.db().clone(), host.store().clone());
            host.register_service(downloads.clone());

            kroma_torrent::port::ledger::routes::<RemoteHost>()
                .merge(kroma_torrent::port::vpn::routes::<RemoteHost>())
                .merge(kroma_torrent::engine::remote::routes::<RemoteHost>())
        },
        vec![kroma_torrent::server_module::<RemoteHost>()],
    )
    .await
}
