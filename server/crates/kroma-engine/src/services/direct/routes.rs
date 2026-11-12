use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

// A container bridge, a VPN or a hypervisor's switch: an address a client in the
// house cannot reach, however private it looks.
const VIRTUAL_INTERFACES: &[&str] = &[
    "docker",
    "br-",
    "bridge",
    "veth",
    "tun",
    "tap",
    "wg",
    "utun",
    "virbr",
    "vmnet",
    "vboxnet",
    "lxc",
    "lxd",
    "cni",
    "flannel",
    "cali",
    "zt",
    "tailscale",
];

/// One address an interface of this machine holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalAddress {
    pub interface: String,
    pub ip: IpAddr,
}

/// Every address this machine's interfaces hold, as the OS lists them.
pub fn local_addresses() -> Vec<LocalAddress> {
    if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .map(|interface| LocalAddress {
            ip: interface.ip(),
            interface: interface.name,
        })
        .collect()
}

/// The private IPv4 addresses a client on this machine's network can reach the
/// server at, the one the routing table leads with first. A server bound to
/// loopback has none; one bound to a single address has that one, if it is
/// private.
pub fn lan_addresses(
    addresses: &[LocalAddress],
    primary: Option<IpAddr>,
    bind: IpAddr,
) -> Vec<Ipv4Addr> {
    let mut found: Vec<Ipv4Addr> = Vec::new();
    for ip in addresses
        .iter()
        .filter(|address| !is_virtual(&address.interface))
        .filter_map(|address| reachable_v4(address.ip))
        .filter(|ip| bind.is_unspecified() || IpAddr::V4(*ip) == bind.to_canonical())
    {
        if !found.contains(&ip) {
            found.push(ip);
        }
    }
    let lead = primary.and_then(reachable_v4);
    if let Some(index) = lead.and_then(|lead| found.iter().position(|ip| *ip == lead)) {
        let first = found.remove(index);
        found.insert(0, first);
    }
    found
}

/// The global IPv6 addresses this machine holds, which a client sharing their
/// /64 is in the same house as.
pub fn global_v6(addresses: &[LocalAddress]) -> Vec<Ipv6Addr> {
    addresses
        .iter()
        .filter(|address| !is_virtual(&address.interface))
        .filter_map(|address| match address.ip {
            IpAddr::V6(v6) if kroma_http::address::is_public(address.ip) => Some(v6),
            _ => None,
        })
        .collect()
}

fn reachable_v4(ip: IpAddr) -> Option<Ipv4Addr> {
    match ip.to_canonical() {
        IpAddr::V4(v4) if v4.is_private() => Some(v4),
        _ => None,
    }
}

fn is_virtual(interface: &str) -> bool {
    let name = interface.to_ascii_lowercase();
    VIRTUAL_INTERFACES
        .iter()
        .any(|prefix| name.starts_with(prefix))
}

#[cfg(test)]
mod tests {
    use super::*;

    const ANY: IpAddr = IpAddr::V4(Ipv4Addr::UNSPECIFIED);

    fn on(interface: &str, ip: &str) -> LocalAddress {
        LocalAddress {
            interface: interface.to_string(),
            ip: ip.parse().unwrap(),
        }
    }

    fn v4(ip: &str) -> Ipv4Addr {
        ip.parse().unwrap()
    }

    #[test]
    fn only_a_private_address_on_a_real_interface_is_a_route() {
        let addresses = [
            on("lo", "127.0.0.1"),
            on("eth0", "169.254.10.2"),
            on("eth0", "192.168.1.2"),
            on("eth1", "203.0.113.7"),
            on("docker0", "172.17.0.1"),
            on("br-1f2e3d", "172.18.0.1"),
            on("veth12ab", "172.18.0.5"),
            on("tun0", "10.8.0.1"),
            on("wg0", "10.9.0.1"),
            on("bridge100", "192.168.139.3"),
            on("eth0", "fd00::2"),
            on("eth0:1", "192.168.1.2"),
        ];

        let routes = lan_addresses(&addresses, None, ANY);

        assert_eq!(routes, vec![v4("192.168.1.2")]);
    }

    #[test]
    fn the_address_the_routing_table_leads_with_comes_first() {
        let addresses = [on("eth1", "10.0.0.4"), on("ovs_eth0", "192.168.1.2")];

        let routes = lan_addresses(&addresses, Some("192.168.1.2".parse().unwrap()), ANY);

        assert_eq!(routes, vec![v4("192.168.1.2"), v4("10.0.0.4")]);
    }

    #[test]
    fn a_primary_address_that_is_not_a_route_changes_nothing() {
        let addresses = [on("eth0", "192.168.1.2"), on("eth1", "10.0.0.4")];

        let routes = lan_addresses(&addresses, Some("10.8.0.1".parse().unwrap()), ANY);

        assert_eq!(routes, vec![v4("192.168.1.2"), v4("10.0.0.4")]);
    }

    #[test]
    fn a_server_bound_to_loopback_has_no_route_and_one_bound_to_an_address_has_that_one() {
        let addresses = [on("eth0", "192.168.1.2"), on("eth1", "10.0.0.4")];

        assert!(lan_addresses(&addresses, None, "127.0.0.1".parse().unwrap()).is_empty());
        assert_eq!(
            lan_addresses(&addresses, None, "10.0.0.4".parse().unwrap()),
            vec![v4("10.0.0.4")]
        );
        assert_eq!(
            lan_addresses(&addresses, None, IpAddr::V6(Ipv6Addr::UNSPECIFIED)).len(),
            2
        );
    }

    #[test]
    fn only_a_global_ipv6_address_places_a_neighbour() {
        let addresses = [
            on("eth0", "2001:4860:1:2::10"),
            on("eth0", "fe80::1"),
            on("eth0", "fd00::2"),
            on("wg0", "2001:4860:9:9::1"),
            on("eth0", "192.168.1.2"),
        ];

        assert_eq!(
            global_v6(&addresses),
            vec!["2001:4860:1:2::10".parse::<Ipv6Addr>().unwrap()]
        );
    }
}
