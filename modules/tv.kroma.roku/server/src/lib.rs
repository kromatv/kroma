//! The Roku module: finds the boxes on the LAN, sideloads the KROMA channel
//! onto any in developer mode, and serves that channel its screens.

// The axum `Response` is the Err type of every request guard so handlers
// short-circuit with `?`; boxing it would churn a dozen signatures for nothing.
#![allow(clippy::result_large_err)]

use std::sync::Arc;

use axum::Router;

use kroma_module_sdk::host::{async_trait, service, HostCtx, ServerModule};
use kroma_module_sdk::EmbeddedModule;

mod address;
pub mod channel;
mod config;
mod core;
mod detail;
mod discovery;
mod ecp;
mod installer;
mod lan;
mod routes;
pub mod state;

pub use state::Roku;

pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();
pub const MODULE_ID: &str = "tv.kroma.roku";

pub struct RokuModule;

#[async_trait]
impl<S: HostCtx + Clone + Send + Sync + 'static> ServerModule<S> for RokuModule {
    fn id(&self) -> &'static str {
        MODULE_ID
    }

    fn admin_routes(&self, host: &S) -> Option<Router<S>> {
        let roku = service::<Roku>(host)?;
        Some(routes::routes::<S>(roku))
    }

    async fn on_enable(&self, host: S) {
        if let Some(roku) = service::<Roku>(&host) {
            tokio::spawn(async move { roku.scan().await });
        }
    }
}

pub fn server_module<S: HostCtx + Clone + Send + Sync + 'static>() -> Box<dyn ServerModule<S>> {
    Box::new(RokuModule)
}

/// This sidecar's own directory under the data dir: the channel zip it hands
/// to a box and the developer password it keeps.
pub fn module_dir(data_dir: &std::path::Path) -> std::path::PathBuf {
    data_dir.join("modules").join(MODULE_ID)
}

pub fn roku_service(data_dir: &std::path::Path) -> Arc<Roku> {
    Arc::new(Roku::new(module_dir(data_dir)))
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::host::testing::StubHost;
    use kroma_module_sdk::Module;

    use super::*;

    #[test]
    fn the_module_carries_the_id_its_manifest_declares() {
        let module = server_module::<StubHost>();
        assert_eq!(module.id(), MODULE_ID);
        assert_eq!(MODULE.manifest().id, MODULE_ID);
        assert!(module.migrations().is_empty());
        assert!(module.jobs().is_empty());
    }

    #[test]
    fn the_routes_exist_only_once_the_service_is_registered() {
        let module = server_module::<StubHost>();
        assert!(module.admin_routes(&StubHost::new()).is_none());

        let host = StubHost::new().with_service(roku_service(std::path::Path::new("/data")));
        assert!(module.admin_routes(&host).is_some());
    }

    #[test]
    fn the_sidecar_keeps_its_files_in_its_own_install_directory() {
        assert_eq!(
            module_dir(std::path::Path::new("/data")),
            std::path::PathBuf::from("/data/modules/tv.kroma.roku")
        );
    }
}
