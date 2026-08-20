//! The VPN module as a standalone process (its `.kmod` entrypoint).
//!
//! It answers the `vpn-proxy` point and serves its admin page (`/vpn/*`,
//! reverse-proxied by the core), and calls `download-vpn` (the engine's
//! kill-switch status and restart) at the point of use.

use kroma_module_runtime::RemoteHost;
use kroma_module_sdk::host::HostCtx;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    kroma_module_runtime::serve(
        move |host| {
            // The module owns the WireGuard bridge service (its own code resolves
            // it via service::<Vpn>).
            host.register_service(kroma_vpn::Vpn::new(host.data_dir().to_path_buf()));
            kroma_vpn::port::routes()
        },
        vec![kroma_vpn::server_module::<RemoteHost>()],
    )
    .await
}
