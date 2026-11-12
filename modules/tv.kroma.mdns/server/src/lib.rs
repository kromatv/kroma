//! mDNS / DNS-SD advertising so LAN clients can find the server without manual
//! configuration: a `_kroma._tcp` service plus the `kroma.local` hostname.
//! Best-effort — if mDNS can't start the server runs fine without it.

use anyhow::Result;
use kroma_module_sdk::host::lan::{self, LanService};
use tracing::info;

pub const HOSTNAME: &str = "kroma.local.";
pub const SERVICE_TYPE: &str = "_kroma._tcp.local.";

/// What this module publishes for a server listening on `port`.
pub fn service(port: u16, instance: &str) -> LanService {
    LanService {
        kind: SERVICE_TYPE.to_string(),
        name: instance.to_string(),
        host: HOSTNAME.to_string(),
        port,
        properties: vec![
            ("path".to_string(), "/api".to_string()),
            ("version".to_string(), env!("CARGO_PKG_VERSION").to_string()),
        ],
    }
}

/// Publish the server until [`lan::withdraw`] or until this module stops.
pub fn advertise(port: u16, instance: &str) -> Result<u64> {
    info!("mDNS: advertising {HOSTNAME} on :{port} ({SERVICE_TYPE})");
    lan::announce(service(port, instance)).map_err(anyhow::Error::msg)
}

pub mod module;
pub use module::MODULE;

use std::sync::Mutex;

use kroma_module_sdk::host::{async_trait, HostCtx, ServerModule};

pub const MODULE_ID: &str = "tv.kroma.mdns";

/// Lifecycle-only service, no routes: holds the announcement between enable and
/// disable, gated on the `localDiscovery` setting.
#[derive(Default)]
pub struct MdnsModule {
    announcement: Mutex<Option<u64>>,
}

// The core's port, not this helper process's: the advertised `.local` address
// has to point at the server.
fn core_port() -> Option<u16> {
    std::env::var("KROMA_CORE_PORT").ok()?.parse().ok()
}

#[async_trait]
impl<S: HostCtx + Clone + Send + Sync + 'static> ServerModule<S> for MdnsModule {
    fn id(&self) -> &'static str {
        MODULE_ID
    }

    async fn on_enable(&self, host: S) {
        if !host.setting_bool("localDiscovery", true) {
            info!("mDNS: local discovery disabled in settings");
            return;
        }
        let Some(port) = core_port() else {
            tracing::warn!("mDNS: no KROMA_CORE_PORT; not advertising");
            return;
        };
        match advertise(port, "KROMA") {
            Ok(announcement) => *self.announcement.lock().unwrap() = Some(announcement),
            Err(e) => tracing::warn!(error = %format!("{e:#}"), "mDNS advertising unavailable"),
        }
    }

    async fn on_disable(&self, _host: S) {
        if let Some(announcement) = self.announcement.lock().unwrap().take() {
            lan::withdraw(announcement);
        }
    }
}

pub fn server_module<S: HostCtx + Clone + Send + Sync + 'static>() -> Box<dyn ServerModule<S>> {
    Box::new(MdnsModule::default())
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::host::testing::StubHost;
    use kroma_module_sdk::Module;
    use serde_json::json;

    use super::*;

    static CORE_PORT: Mutex<()> = Mutex::new(());

    fn with_core_port<T>(f: impl FnOnce() -> T) -> T {
        let _held = CORE_PORT
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        f()
    }

    fn block_on<F: std::future::Future>(f: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(f)
    }

    #[test]
    fn the_advertised_names_have_the_shapes_dns_sd_requires() {
        // DNS-SD names are fully-qualified: without the trailing dot a resolver
        // treats them as relative and appends the search domain, so
        // `kroma.local` becomes `kroma.local.lan` and nothing resolves.
        assert!(HOSTNAME.ends_with('.'), "{HOSTNAME}");
        assert!(SERVICE_TYPE.ends_with('.'), "{SERVICE_TYPE}");
        // The client that looks us up hardcodes the same string.
        assert_eq!(SERVICE_TYPE, "_kroma._tcp.local.");
        assert!(
            HOSTNAME.ends_with(".local."),
            "a .local name is what clients try"
        );
    }

    #[test]
    fn the_published_service_names_the_server_and_its_api_path() {
        let published = service(4040, "KROMA");

        assert_eq!(published.kind, SERVICE_TYPE);
        assert_eq!(published.host, HOSTNAME);
        assert_eq!(published.port, 4040);
        assert!(published.properties.contains(&("path".to_string(), "/api".to_string())));
    }

    #[test]
    fn the_advertised_port_is_the_cores_not_this_modules_own() {
        with_core_port(|| {
            std::env::set_var("KROMA_CORE_PORT", "4040");
            assert_eq!(core_port(), Some(4040));
            std::env::set_var("KROMA_CORE_PORT", "http://kroma.local");
            assert_eq!(core_port(), None, "never a guessed port");
            std::env::remove_var("KROMA_CORE_PORT");
            assert_eq!(core_port(), None);
        });
    }

    #[test]
    fn the_module_carries_the_id_its_manifest_declares_and_contributes_nothing_else() {
        let module = server_module::<StubHost>();
        assert_eq!(module.id(), MODULE_ID);
        assert_eq!(MODULE.manifest().id, MODULE_ID);
        assert!(
            module.migrations().is_empty(),
            "a lifecycle-only module owns no tables"
        );
        assert!(module.admin_routes(&StubHost::new()).is_none());
        assert!(module.jobs().is_empty());
    }

    #[test]
    fn discovery_switched_off_in_settings_leaves_nothing_announced() {
        let module = MdnsModule::default();
        let host = StubHost::new().with_setting("localDiscovery", json!(false));

        block_on(ServerModule::on_enable(&module, host));

        assert!(module.announcement.lock().unwrap().is_none());
    }

    #[test]
    fn a_server_that_names_no_port_gets_nothing_advertised_rather_than_a_guessed_one() {
        with_core_port(|| {
            std::env::remove_var("KROMA_CORE_PORT");
            let module = MdnsModule::default();
            block_on(ServerModule::on_enable(&module, StubHost::new()));

            assert!(module.announcement.lock().unwrap().is_none());
        });
    }

    #[test]
    fn disabling_a_module_that_never_started_advertising_is_a_no_op_the_kernel_can_repeat() {
        let module = MdnsModule::default();
        let host = StubHost::new();

        block_on(async {
            ServerModule::on_disable(&module, host.clone()).await;
            ServerModule::on_disable(&module, host).await;
        });

        assert!(module.announcement.lock().unwrap().is_none());
    }
}
