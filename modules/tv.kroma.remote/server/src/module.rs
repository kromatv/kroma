use std::sync::Arc;

use axum::Router;

use kroma_module_sdk::host::{async_trait, service, HostCtx, ServerModule};

use crate::access::RemoteAccess;
use crate::routes::routes;

pub const MODULE_ID: &str = "tv.kroma.remote";

/// The Remote-access sub-module: serves the connector's admin routes and, on
/// enable, brings the managed tunnel up (if configured) and supervises it. It
/// resolves its own [`RemoteAccess`] through the host's service registry.
pub struct RemoteModule;

#[async_trait]
impl<S: HostCtx + Clone + Send + Sync + 'static> ServerModule<S> for RemoteModule {
    fn id(&self) -> &'static str {
        MODULE_ID
    }

    fn admin_routes(&self, host: &S) -> Option<Router<S>> {
        let remote = service::<RemoteAccess>(host)?;
        Some(routes::<S>(remote))
    }

    async fn on_enable(&self, host: S) {
        // Bring the tunnel up from the stored config (a no-op when off) and keep
        // it alive via the watchdog.
        if let Some(remote) = service::<RemoteAccess>(&host) {
            remote.spawn_boot(Arc::new(host.clone()));
        }
    }

    async fn on_disable(&self, host: S) {
        // Disabling the module has to take the tunnel with it: the connector is
        // a child process, so leaving it up would keep the box publicly
        // reachable with no module left to show or stop it.
        if let Some(remote) = service::<RemoteAccess>(&host) {
            remote.shutdown().await;
        }
    }
}

/// This module's backend behavior, for the host's generic module roster.
pub fn server_module<S: HostCtx + Clone + Send + Sync + 'static>() -> Box<dyn ServerModule<S>> {
    Box::new(RemoteModule)
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::Ordering;

    use super::*;

    use crate::test_support::{host, remote_for};

    #[test]
    fn identifies_itself_by_the_module_id() {
        let module = server_module::<kroma_module_sdk::host::testing::StubHost>();

        assert_eq!(module.id(), MODULE_ID);
    }

    #[test]
    fn serves_admin_routes_only_once_the_connector_is_registered() {
        let bare = host();
        let host = host();
        let remote = remote_for(&host);
        let registered = host.with_service(remote);

        let without = RemoteModule.admin_routes(&bare);
        let with = RemoteModule.admin_routes(&registered);

        assert!(without.is_none());
        assert!(with.is_some());
    }

    #[tokio::test]
    async fn shuts_the_connector_down_when_disabled_and_watches_it_when_enabled() {
        let host = host();
        let remote = remote_for(&host);
        let host = host.with_service(remote.clone());

        RemoteModule.on_enable(host.clone()).await;
        let watching = remote.watching.load(Ordering::SeqCst);
        RemoteModule.on_disable(host).await;

        assert!(watching);
        assert!(remote.stopping.load(Ordering::SeqCst));
    }
}
