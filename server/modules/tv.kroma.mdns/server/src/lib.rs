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

    let props = [("path", "/api"), ("version", env!("CARGO_PKG_VERSION"))];

    // Only the primary LAN IP. `enable_addr_auto` would publish every interface
    // (Docker bridges, VPNs, …), and a client could pick a dead one.
    let service = match primary_lan_ip() {
        Some(ip) => {
            let ip = ip.to_string();
            info!("mDNS: advertising {HOSTNAME} → {ip}:{port} ({SERVICE_TYPE})");
            ServiceInfo::new(SERVICE_TYPE, instance, HOSTNAME, ip.as_str(), port, &props[..])?
        }
        None => {
            info!("mDNS: advertising {SERVICE_TYPE} on :{port} (auto addresses)");
            ServiceInfo::new(SERVICE_TYPE, instance, HOSTNAME, "", port, &props[..])?.enable_addr_auto()
        }
    };

    daemon.register(service)?;
    Ok(daemon)
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

use std::sync::{Arc, Mutex};

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
    std::env::var("KROMA_CORE_URL").ok()?.rsplit(':').next()?.trim_end_matches('/').parse().ok()
}

#[async_trait]
impl<S: HostCtx + Clone + Send + Sync + 'static> ServerModule<S> for MdnsModule {
    fn id(&self) -> &'static str {
        MODULE_ID
    }

    async fn on_enable(&self, host: Arc<dyn HostCtx>) {
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

    async fn on_disable(&self, _host: Arc<dyn HostCtx>) {
        // Dropping the daemon unregisters the service.
        self.daemon.lock().unwrap().take();
    }
}

pub fn server_module<S: HostCtx + Clone + Send + Sync + 'static>() -> Box<dyn ServerModule<S>> {
    Box::new(MdnsModule::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_advertised_names_have_the_shapes_dns_sd_requires() {
        // DNS-SD names are fully-qualified: without the trailing dot a resolver
        // treats them as relative and appends the search domain, so
        // `kroma.local` becomes `kroma.local.lan` and nothing resolves.
        assert!(HOSTNAME.ends_with('.'), "{HOSTNAME}");
        assert!(SERVICE_TYPE.ends_with('.'), "{SERVICE_TYPE}");
        // The client that looks us up hardcodes the same string.
        assert_eq!(SERVICE_TYPE, "_kroma._tcp.local.");
        assert!(HOSTNAME.ends_with(".local."), "a .local name is what clients try");
    }

    #[test]
    fn the_primary_lan_ip_is_never_one_a_client_could_not_reach() {
        match primary_lan_ip() {
            Some(ip) => {
                assert!(!ip.is_loopback(), "advertised loopback: {ip}");
                assert!(!ip.is_unspecified(), "advertised the wildcard: {ip}");
            }
            // A sandbox with no route at all: the fallback path, not a failure.
            None => {}
        }
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
}
