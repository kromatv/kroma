//! The qBittorrent engine as a standalone process (its `.kmod` entrypoint).
//!
//! It answers the `download-client` point under the instance `qbittorrent`, and
//! nothing else: no admin routes, no database, no lifecycle. Being installed and
//! enabled is what makes it available, because the download module resolves
//! whoever answers the point when a client row names this kind.

use kroma_module_runtime::RemoteHost;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    kroma_module_runtime::serve(
        |_host| kroma_qbittorrent::port::routes(),
        vec![kroma_qbittorrent::server_module::<RemoteHost>()],
    )
    .await
}
