//! The Downloads module as a standalone process (its `.kmod` entrypoint).

use std::sync::Arc;

use kroma_module_runtime::RemoteHost;
use kroma_module_sdk::host::{HostCtx, HostStorage};
use kroma_module_sdk::media::hls;
use kroma_torrent::watch::Watch;
use kroma_torrent::DownloadManager;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let data_dir = std::path::PathBuf::from(std::env::var("KROMA_DATA_DIR")?);
    let port: u16 = std::env::var("KROMA_MODULE_PORT")?.parse()?;

    kroma_module_runtime::serve(
        move |host| {
            let host_ref: Arc<dyn HostCtx> = Arc::new(host.clone());
            let downloads =
                DownloadManager::new(host_ref, &data_dir, host.db().clone(), host.store().clone());
            host.register_service(downloads.clone());

            let watch = Watch::new(&data_dir, port, live_sessions(host));
            watch.spawn_reaper(downloads.clone());
            host.register_service(watch);

            kroma_torrent::port::ledger::routes::<RemoteHost>()
                .merge(kroma_torrent::port::vpn::routes::<RemoteHost>())
                .merge(kroma_torrent::port::watchable::routes::<RemoteHost>())
                .merge(kroma_torrent::engine::remote::routes::<RemoteHost>())
        },
        vec![kroma_torrent::server_module::<RemoteHost>()],
    )
    .await
}

fn live_sessions(host: &RemoteHost) -> usize {
    hls::live_sessions(host.setting_i64(hls::MAX_CONCURRENT_KEY, hls::DEFAULT_MAX_CONCURRENT))
}
