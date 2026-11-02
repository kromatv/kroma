//! The qBittorrent engine as a standalone process (its `.kmod` entrypoint).
//!
//! It answers the `download-client` point under the instance `qbittorrent`, and
//! nothing else: no admin routes, no database, no lifecycle. Being installed and
//! enabled is what makes it available, because the download module resolves
//! whoever answers the point when a client row names this kind.

use kroma_module_runtime::RemoteHost;

kroma_module_runtime::module_main!(
        |_host| kroma_qbittorrent::port::routes(),
        vec![kroma_qbittorrent::server_module::<RemoteHost>()],);
