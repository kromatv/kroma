use axum::Router;

use kroma_module_sdk::host::{async_trait, service, HostCtx, ServerModule};

use crate::routes;
use crate::vpn::Vpn;

/// This module's id (matches its `module.json`).
pub const MODULE_ID: &str = "tv.kroma.vpn";

/// The VPN sub-module: serves the bridge's admin routes and, on enable, brings
/// the WireGuard-to-SOCKS5 bridge up (from the stored config); on disable, tears
/// it down so nothing is left tunnelling. It resolves its own [`Vpn`] through the
/// host's service registry.
pub struct VpnModule;

#[async_trait]
impl<S: HostCtx + Clone + Send + Sync + 'static> ServerModule<S> for VpnModule {
    fn id(&self) -> &'static str {
        MODULE_ID
    }

    fn admin_routes(&self, _host: &S) -> Option<Router<S>> {
        Some(routes::routes::<S>())
    }

    async fn on_enable(&self, host: S) {
        if let Some(vpn) = service::<Vpn>(&host) {
            vpn.resume();
            vpn.apply(&host).await;
        }
    }

    async fn on_disable(&self, host: S) {
        if let Some(vpn) = service::<Vpn>(&host) {
            vpn.stop().await;
        }
    }
}

/// This module's backend behavior, for the host's generic module roster.
pub fn server_module<S: HostCtx + Clone + Send + Sync + 'static>() -> Box<dyn ServerModule<S>> {
    Box::new(VpnModule)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::test_support::{configured_host, eventually, install_script, vpn_for, RUNNING};
    use kroma_module_sdk::host::testing::StubHost;

    #[test]
    fn the_module_answers_to_its_id_and_serves_admin_routes() {
        let module = server_module::<StubHost>();

        assert_eq!(module.id(), MODULE_ID);
        assert!(module.admin_routes(&StubHost::new()).is_some());
    }

    #[tokio::test]
    async fn enable_starts_the_bridge_and_disable_takes_it_down() {
        let base = configured_host();
        install_script(base.data_dir(), RUNNING);
        let vpn = vpn_for(&base);
        let host = base.with_service(vpn.clone());
        let module = VpnModule;

        ServerModule::<StubHost>::on_enable(&module, host.clone()).await;

        eventually(|| async { vpn.running().await }).await;
        ServerModule::<StubHost>::on_disable(&module, host).await;
        assert!(!vpn.running().await);
    }

    #[tokio::test]
    async fn enable_and_disable_without_a_registered_service_do_nothing() {
        let host = StubHost::new();
        let module = VpnModule;

        ServerModule::<StubHost>::on_enable(&module, host.clone()).await;
        ServerModule::<StubHost>::on_disable(&module, host).await;
    }
}
