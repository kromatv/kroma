//! The Downloads module as a standalone process (its `.kmod` entrypoint). It also
//! hosts the torrent-engine modules: they register their client `kind` into this
//! process's one `DownloadManager`, so they must share its process.

use std::sync::Arc;

use kroma_module_runtime::RemoteHost;
use kroma_module_sdk::ports::{
    download_routes, downloadvpn_routes, DownloadClientHost, DownloadDbPort, DownloadGrabPort,
    DownloadVpnPort,
};
use kroma_torrent::{DownloadDb, DownloadManager};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let data_dir = std::path::PathBuf::from(std::env::var("KROMA_DATA_DIR")?);

    let downloads = DownloadManager::new(&data_dir);

    // The contracts this module serves; what it consumes is resolved at the
    // point of use, so nothing here names a peer.
    let grab: Arc<dyn DownloadGrabPort> = downloads.clone();
    let ledger: Arc<dyn DownloadDbPort> = Arc::new(DownloadDb);
    let dc_vpn: Arc<dyn DownloadVpnPort> = downloads.clone();
    let extra = download_routes::<RemoteHost>(grab, ledger)
        .merge(downloadvpn_routes::<RemoteHost>(dc_vpn));

    let downloads_setup = downloads.clone();
    kroma_module_runtime::serve(
        move |host| {
            host.register_service(downloads_setup.clone());
            let dc_host: Arc<dyn DownloadClientHost> = downloads_setup.clone();
            host.register_port(dc_host);

        },
        vec![
            kroma_torrent::server_module::<RemoteHost>(),
            kroma_transmission::server_module::<RemoteHost>(),
            kroma_qbittorrent::server_module::<RemoteHost>(),
        ],
        extra,
    )
    .await
}
