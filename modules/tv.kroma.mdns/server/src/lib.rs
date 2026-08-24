//! mDNS / DNS-SD advertising so LAN clients can find the server without manual
//! configuration: a `_kroma._tcp` service plus the `kroma.local` hostname.
//! Best-effort — if mDNS can't start the server runs fine without it.

use std::net::{IpAddr, UdpSocket};

use anyhow::Result;
use mdns_sd::{ServiceDaemon, ServiceInfo};
use tracing::info;

pub const HOSTNAME: &str = "kroma.local.";
pub const SERVICE_TYPE: &str = "_kroma._tcp.local.";

/// Keep the returned daemon alive for the process lifetime: dropping it
/// unregisters the service.
pub fn advertise(port: u16, instance: &str) -> Result<ServiceDaemon> {
    let daemon = ServiceDaemon::new()?;
    daemon.register(service_info(primary_lan_ip(), port, instance)?)?;
    Ok(daemon)
}

// Only the primary LAN IP. `enable_addr_auto` would publish every interface
// (Docker bridges, VPNs, …), and a client could pick a dead one.
fn service_info(ip: Option<IpAddr>, port: u16, instance: &str) -> Result<ServiceInfo> {
    let props = [("path", "/api"), ("version", env!("CARGO_PKG_VERSION"))];
    match ip {
        Some(ip) => {
            let ip = ip.to_string();
            info!("mDNS: advertising {HOSTNAME} → {ip}:{port} ({SERVICE_TYPE})");
            Ok(ServiceInfo::new(
                SERVICE_TYPE,
                instance,
                HOSTNAME,
                ip.as_str(),
                port,
                &props[..],
            )?)
        }
        None => {
            info!("mDNS: advertising {SERVICE_TYPE} on :{port} (auto addresses)");
            Ok(
                ServiceInfo::new(SERVICE_TYPE, instance, HOSTNAME, "", port, &props[..])?
                    .enable_addr_auto(),
            )
        }
    }
}

// Connecting a UDP socket sends no packets; it only consults the routing table.
fn primary_lan_ip() -> Option<IpAddr> {
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("8.8.8.8:80").ok()?;
    usable_lan_ip(sock.local_addr().ok()?.ip())
}

// A machine with no route reports loopback or the wildcard; advertising either
// hands every client an address that cannot work.
fn usable_lan_ip(ip: IpAddr) -> Option<IpAddr> {
    (!ip.is_loopback() && !ip.is_unspecified()).then_some(ip)
}

pub mod module;
pub use module::MODULE;

use std::sync::Mutex;

use kroma_module_sdk::host::{async_trait, HostCtx, ServerModule};

pub const MODULE_ID: &str = "tv.kroma.mdns";

/// Lifecycle-only service, no routes: holds the daemon between enable and
/// disable, gated on the `localDiscovery` setting.
#[derive(Default)]
pub struct MdnsModule {
    daemon: Mutex<Option<ServiceDaemon>>,
}

// The core's port, not this helper process's: the advertised `.local` address
// has to point at the server.
fn core_port() -> Option<u16> {
    std::env::var("KROMA_CORE_URL")
        .ok()?
        .rsplit(':')
        .next()?
        .trim_end_matches('/')
        .parse()
        .ok()
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
            tracing::warn!("mDNS: no KROMA_CORE_URL port; not advertising");
            return;
        };
        match advertise(port, "KROMA") {
            Ok(daemon) => *self.daemon.lock().unwrap() = Some(daemon),
            Err(e) => tracing::warn!(error = %format!("{e:#}"), "mDNS advertising unavailable"),
        }
    }

    async fn on_disable(&self, _host: S) {
        // Dropping the daemon unregisters the service.
        self.daemon.lock().unwrap().take();
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

    static CORE_URL: Mutex<()> = Mutex::new(());

    fn with_core_url<T>(f: impl FnOnce() -> T) -> T {
        let _held = CORE_URL
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
    fn the_primary_lan_ip_is_never_one_a_client_could_not_reach() {
        let ip = primary_lan_ip();
        assert!(
            ip.is_none_or(|a| !a.is_loopback() && !a.is_unspecified()),
            "{ip:?}"
        );
    }

    #[test]
    fn the_advertised_service_carries_the_lan_address_and_the_api_path() {
        let ip = IpAddr::V4(std::net::Ipv4Addr::new(192, 168, 1, 42));
        let info = service_info(Some(ip), 4040, "KROMA").unwrap();

        assert_eq!(info.get_type(), SERVICE_TYPE);
        assert_eq!(info.get_hostname(), HOSTNAME);
        assert_eq!(info.get_port(), 4040);
        assert_eq!(
            info.get_addresses_v4().into_iter().collect::<Vec<_>>(),
            [&std::net::Ipv4Addr::new(192, 168, 1, 42)]
        );
        assert_eq!(info.get_property_val_str("path"), Some("/api"));
        assert_eq!(
            info.get_property_val_str("version"),
            Some(env!("CARGO_PKG_VERSION"))
        );
    }

    #[test]
    fn a_machine_with_no_usable_address_advertises_nothing_and_lets_mdns_fill_it_in() {
        let info = service_info(None, 4040, "KROMA").unwrap();

        assert!(info.get_addresses().is_empty());
        assert_eq!(info.get_hostname(), HOSTNAME);
        assert_eq!(info.get_port(), 4040);
        assert_eq!(info.get_property_val_str("path"), Some("/api"));
    }

    #[test]
    fn an_address_no_client_could_reach_is_refused() {
        use std::net::{Ipv4Addr, Ipv6Addr};
        assert_eq!(usable_lan_ip(IpAddr::V4(Ipv4Addr::LOCALHOST)), None);
        assert_eq!(usable_lan_ip(IpAddr::V4(Ipv4Addr::UNSPECIFIED)), None);
        assert_eq!(usable_lan_ip(IpAddr::V6(Ipv6Addr::LOCALHOST)), None);
        assert_eq!(usable_lan_ip(IpAddr::V6(Ipv6Addr::UNSPECIFIED)), None);

        let lan = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 42));
        assert_eq!(usable_lan_ip(lan), Some(lan));
    }

    #[test]
    fn asking_twice_gives_the_same_address() {
        assert_eq!(primary_lan_ip(), primary_lan_ip());
    }

    #[test]
    fn the_advertised_port_is_read_off_the_core_url_not_this_sidecars_own() {
        with_core_url(|| {
            std::env::set_var("KROMA_CORE_URL", "http://127.0.0.1:4040");
            assert_eq!(core_port(), Some(4040));
            std::env::set_var("KROMA_CORE_URL", "http://127.0.0.1:4040/");
            assert_eq!(core_port(), Some(4040));
            std::env::set_var("KROMA_CORE_URL", "http://kroma.local");
            assert_eq!(
                core_port(),
                None,
                "a URL with no port must not advertise a guess"
            );
            std::env::remove_var("KROMA_CORE_URL");
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
    fn discovery_switched_off_in_settings_leaves_the_module_holding_no_daemon() {
        let module = MdnsModule::default();
        let host = StubHost::new().with_setting("localDiscovery", json!(false));

        block_on(ServerModule::on_enable(&module, host));

        assert!(module.daemon.lock().unwrap().is_none());
    }

    #[test]
    fn a_core_url_carrying_no_port_advertises_nothing_rather_than_a_guessed_one() {
        with_core_url(|| {
            std::env::set_var("KROMA_CORE_URL", "http://kroma.local");
            let module = MdnsModule::default();
            block_on(ServerModule::on_enable(&module, StubHost::new()));
            std::env::remove_var("KROMA_CORE_URL");

            assert!(module.daemon.lock().unwrap().is_none());
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

        assert!(module.daemon.lock().unwrap().is_none());
    }
}
