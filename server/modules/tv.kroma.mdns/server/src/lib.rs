//! mDNS / DNS-SD advertising so LAN clients can find the server without manual
//! configuration.
//!
//! Advertises a `_kroma._tcp` service and resolves the hostname `kroma.local` to
//! this machine's LAN address(es). Browsers / TV webviews can't *browse* mDNS
//! from JavaScript, but many client OSes resolve a `.local` hostname so a
//! client can simply try `http://kroma.local:<port>` and reach us with no IP
//! entry. Best-effort: if mDNS can't start (no multicast, etc.) the server runs
//! fine without it.

use std::net::{IpAddr, UdpSocket};

use anyhow::Result;
use mdns_sd::{ServiceDaemon, ServiceInfo};
use tracing::info;

pub const HOSTNAME: &str = "kroma.local.";
pub const SERVICE_TYPE: &str = "_kroma._tcp.local.";

/// Start advertising on `port`. Returns the running daemon keep it alive for
/// the process lifetime (dropping it unregisters the service).
pub fn advertise(port: u16, instance: &str) -> Result<ServiceDaemon> {
    let daemon = ServiceDaemon::new()?;

    // TXT records: where the API lives + our version, for richer clients.
    let props = [("path", "/api"), ("version", env!("CARGO_PKG_VERSION"))];

    // Advertise only the primary LAN IP. `enable_addr_auto` would publish every
    // interface (Docker bridges, VPNs, …), and a client could pick a dead one.
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

/// The primary outbound LAN IPv4 the source address the OS would use to reach
/// the internet. Found by "connecting" a UDP socket (no packets are sent) and
/// reading its local address.
fn primary_lan_ip() -> Option<IpAddr> {
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("8.8.8.8:80").ok()?;
    usable_lan_ip(sock.local_addr().ok()?.ip())
}

/// Keep an address only if a client on the LAN could actually reach us at it.
///
/// A machine with no route reports loopback or the wildcard; advertising either
/// hands every client an address that cannot work, which is worse than
/// advertising nothing (the caller then falls back to auto addresses).
fn usable_lan_ip(ip: IpAddr) -> Option<IpAddr> {
    (!ip.is_loopback() && !ip.is_unspecified()).then_some(ip)
}

pub mod module;
pub use module::MODULE;

use std::sync::{Arc, Mutex};

use kroma_module_sdk::host::{async_trait, HostCtx, ServerModule};

/// This module's id (matches `module.json`).
pub const MODULE_ID: &str = "tv.kroma.mdns";

/// The mDNS module's backend behavior: on enable it advertises the core's port
/// over mDNS (gated on the `localDiscovery` setting) and holds the daemon; on
/// disable it drops it. It has no routes — it's a lifecycle-only service.
#[derive(Default)]
pub struct MdnsModule {
    daemon: Mutex<Option<ServiceDaemon>>,
}

/// The core's listen port, from the `KROMA_CORE_URL` the supervisor set (so the
/// advertised `.local` address points at the server, not this helper process).
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

/// This module's backend behavior, for the out-of-process runtime.
pub fn server_module<S: HostCtx + Clone + Send + Sync + 'static>() -> Box<dyn ServerModule<S>> {
    Box::new(MdnsModule::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_advertised_names_have_the_shapes_dns_sd_requires() {
        // These are wire constants, not labels. DNS-SD names are
        // fully-qualified: without the trailing dot a resolver treats them as
        // relative and appends the search domain, so `kroma.local` silently
        // becomes `kroma.local.lan` on some networks and nothing resolves.
        assert!(HOSTNAME.ends_with('.'), "{HOSTNAME}");
        assert!(SERVICE_TYPE.ends_with('.'), "{SERVICE_TYPE}");
        // The service type is `_<name>._<proto>.local.`; the client that looks
        // us up hardcodes the same string.
        assert_eq!(SERVICE_TYPE, "_kroma._tcp.local.");
        assert!(HOSTNAME.ends_with(".local."), "a .local name is what clients try");
    }

    #[test]
    fn the_primary_lan_ip_is_never_one_a_client_could_not_reach() {
        // The point of picking ONE address is that a client must not be handed a
        // dead one. Loopback and 0.0.0.0 are exactly that, and both are what a
        // machine with no route reports - so they become `None` and the daemon
        // falls back to auto addresses instead of advertising a lie.
        //
        // No packet is sent: connecting a UDP socket only consults the routing
        // table, so this works offline.
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
        // Advertising one of these is worse than advertising nothing: every
        // client gets an address that cannot work. `None` makes the caller fall
        // back to auto addresses instead.
        use std::net::{Ipv4Addr, Ipv6Addr};
        assert_eq!(usable_lan_ip(IpAddr::V4(Ipv4Addr::LOCALHOST)), None);
        assert_eq!(usable_lan_ip(IpAddr::V4(Ipv4Addr::UNSPECIFIED)), None);
        assert_eq!(usable_lan_ip(IpAddr::V6(Ipv6Addr::LOCALHOST)), None);
        assert_eq!(usable_lan_ip(IpAddr::V6(Ipv6Addr::UNSPECIFIED)), None);

        // A real LAN address survives.
        let lan = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 42));
        assert_eq!(usable_lan_ip(lan), Some(lan));
    }

    #[test]
    fn asking_twice_gives_the_same_address() {
        // It is read per call rather than cached, so a wandering answer would
        // mean the advertised address depends on when the daemon started.
        assert_eq!(primary_lan_ip(), primary_lan_ip());
    }
}
