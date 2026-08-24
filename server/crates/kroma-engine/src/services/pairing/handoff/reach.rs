use std::net::IpAddr;

/// Whether two client addresses put their devices on one network, as seen from
/// wherever the server happens to sit. That is the only question this feature
/// asks: the server is a rendezvous, and whether it shares a network with either
/// device is beside the point. A TV and a phone in the same room must find each
/// other through a server on the other side of the world.
///
/// Which makes the comparison depend on how the two got here:
///
/// - **Private IPv4** (the server is on their network, seeing them directly):
///   same /24. One home spans `192.168.1.20` on ethernet and `192.168.1.50` on
///   wifi, so equality would be too strict.
/// - **Public IPv4** (the server is elsewhere, seeing them through their NAT):
///   the very same address. A household leaves through one, so equality is what
///   "together" means here, and /24 across the open internet would be far too
///   loose.
/// - **IPv6**, either way: same /64. That is one prefix delegation, which is one
///   LAN, whether the addresses are unique-local or global.
///
/// Two limits worth knowing, both of which fall back to the code on the screen:
/// a home routed across several subnets, and a dual-stack home where one device
/// arrives over IPv6 and the other over IPv4.
pub fn same_network(a: &str, b: &str) -> bool {
    matches!((network_of(a), network_of(b)), (Some(a), Some(b)) if a == b)
}

// The rule above as a value, so the store can also GROUP beacons by network
// (which one holds the most) and not only compare two of them. None is an
// address that places its device nowhere: it is nobody's neighbour, and the
// store holds the lot of them on one share.
#[derive(PartialEq, Eq, Hash)]
pub(super) enum Network {
    Subnet([u8; 3]),
    Address(std::net::Ipv4Addr),
    Delegation([u8; 8]),
}

pub(super) fn network_of(ip: &str) -> Option<Network> {
    match host(ip)? {
        IpAddr::V4(v4) if behind_one_router(&v4) => {
            let [a, b, c, _] = v4.octets();
            Some(Network::Subnet([a, b, c]))
        }
        IpAddr::V4(v4) => Some(Network::Address(v4)),
        IpAddr::V6(v6) => Some(Network::Delegation(v6.octets()[..8].try_into().ok()?)),
    }
}

// An address the server can only be seeing because it sits on the same network
// as its owner: nothing routes these across the internet.
fn behind_one_router(ip: &std::net::Ipv4Addr) -> bool {
    ip.is_private() || ip.is_loopback() || ip.is_link_local()
}

// `::ffff:192.168.1.4` and `192.168.1.4` are one host reached over a dual-stack
// socket, so they have to compare as one family.
fn host(ip: &str) -> Option<IpAddr> {
    match ip.trim().parse().ok()? {
        IpAddr::V6(v6) => Some(v6.to_ipv4_mapped().map_or(IpAddr::V6(v6), IpAddr::V4)),
        v4 => Some(v4),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_network_is_the_subnet_when_the_server_sees_them_directly() {
        // Private addresses: one home spans .20 on ethernet and .50 on wifi.
        assert!(same_network("192.168.1.20", "192.168.1.50"));
        assert!(same_network("127.0.0.1", "127.0.0.1"));
        assert!(!same_network("192.168.1.20", "192.168.2.50"));
        assert!(!same_network("192.168.1.20", "10.0.0.7"));
        // A dual-stack socket reports the same host two ways.
        assert!(same_network("::ffff:192.168.1.20", "192.168.1.50"));
    }

    #[test]
    fn same_network_is_the_very_address_when_the_server_is_elsewhere() {
        // Public IPv4: a household leaves through one address, so that address
        // IS the network. A /24 here would span strangers.
        assert!(same_network("203.0.113.7", "203.0.113.7"));
        assert!(!same_network("203.0.113.7", "203.0.113.9"));
        // A private address and a public one are never the same place, whichever
        // way round they come.
        assert!(!same_network("192.168.1.20", "203.0.113.7"));
        assert!(!same_network("203.0.113.7", "192.168.1.20"));
    }

    #[test]
    fn same_network_is_the_prefix_delegation_over_ipv6() {
        // One /64 is one LAN, unique-local or global alike.
        assert!(same_network(
            "fd00:1234:5678:9abc::1",
            "fd00:1234:5678:9abc::2"
        ));
        assert!(!same_network(
            "fd00:1234:5678:9abc::1",
            "fd00:1234:5678:9abd::1"
        ));
        assert!(same_network("2001:db8:1:2::1", "2001:db8:1:2::99"));
        assert!(!same_network("2001:db8:1:2::1", "2001:db8:1:3::1"));
    }

    #[test]
    fn an_address_that_is_not_one_is_nowhere() {
        // Families never match across, and an unparseable address matches nothing.
        assert!(!same_network("192.168.1.20", "fd00::1"));
        assert!(!same_network("not-an-ip", "192.168.1.50"));
        assert!(!same_network("192.168.1.20", ""));
    }
}
