//! The VPN module as a standalone process (its `.kmod` entrypoint).
//!
//! It serves the `vpn-proxy` contract and its admin page (`/vpn/*`,
//! reverse-proxied by the core), and consumes `download-vpn` (the engine's
//! kill-switch status/restart) at the point of use.

use std::sync::Arc;

use kroma_module_runtime::RemoteHost;
use kroma_module_sdk::host::HostCtx;
use kroma_module_sdk::ports::{vpnproxy_routes, VpnProxyPort};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let vpnproxy: Arc<dyn VpnProxyPort> = Arc::new(kroma_vpn::VpnProxy);

    kroma_module_runtime::serve(
        move |host| {
            // The module owns the WireGuard bridge service (its own code resolves
            // it via service::<Vpn>).
            host.register_service(kroma_vpn::Vpn::new(host.data_dir().to_path_buf()));
            vpnproxy_routes(vpnproxy)
        },
        vec![kroma_vpn::server_module::<RemoteHost>()],
    )
    .await
}
