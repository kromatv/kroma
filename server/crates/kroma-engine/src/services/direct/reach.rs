use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// Whether a client at `ip` crossed this machine's own network to reach it: a
/// private address, never this machine itself and never the internet.
pub fn is_private_client(ip: IpAddr) -> bool {
    match ip.to_canonical() {
        IpAddr::V4(v4) => v4.is_private(),
        IpAddr::V6(v6) => is_unique_local(v6),
    }
}

/// Whether a client at `client` is in the same house as this server: it arrived
/// over the network itself, or through the household's own public IPv4, or from
/// an IPv6 address inside a /64 this machine holds.
pub fn same_network(client: IpAddr, public_v4: Option<Ipv4Addr>, own_v6: &[Ipv6Addr]) -> bool {
    if is_private_client(client) {
        return true;
    }
    match client.to_canonical() {
        IpAddr::V4(v4) => public_v4 == Some(v4),
        IpAddr::V6(v6) => own_v6
            .iter()
            .any(|own| own.segments()[..4] == v6.segments()[..4]),
    }
}

// fc00::/7; stable std has no predicate for it.
fn is_unique_local(ip: Ipv6Addr) -> bool {
    ip.segments()[0] & 0xfe00 == 0xfc00
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    const HOME: Ipv4Addr = Ipv4Addr::new(203, 0, 113, 7);

    #[test]
    fn a_client_on_the_network_itself_is_a_private_client() {
        for client in [
            "192.168.1.20",
            "10.0.0.4",
            "172.16.5.5",
            "::ffff:192.168.1.20",
            "fd00::4",
        ] {
            assert!(is_private_client(ip(client)), "{client}");
        }
    }

    #[test]
    fn this_machine_a_link_and_the_internet_are_not() {
        for client in [
            "127.0.0.1",
            "::1",
            "169.254.1.1",
            "fe80::1",
            "203.0.113.7",
            "2001:db8::1",
        ] {
            assert!(!is_private_client(ip(client)), "{client}");
        }
    }

    #[test]
    fn a_private_client_is_on_the_same_network_whatever_the_echo_said() {
        assert!(same_network(ip("192.168.1.20"), None, &[]));
    }

    #[test]
    fn a_public_client_is_on_it_only_through_the_households_own_address() {
        assert!(same_network(ip("203.0.113.7"), Some(HOME), &[]));
        assert!(same_network(ip("::ffff:203.0.113.7"), Some(HOME), &[]));
        assert!(!same_network(ip("203.0.113.8"), Some(HOME), &[]));
        assert!(!same_network(ip("203.0.113.7"), None, &[]));
    }

    #[test]
    fn an_ipv6_client_is_on_it_inside_a_prefix_this_machine_holds() {
        let own = ["2001:db8:1:2::10".parse().unwrap()];

        assert!(same_network(ip("2001:db8:1:2::99"), None, &own));
        assert!(!same_network(ip("2001:db8:1:3::99"), None, &own));
        assert!(!same_network(ip("2001:db8:1:2::99"), Some(HOME), &[]));
    }

    #[test]
    fn this_machine_is_not_a_neighbour() {
        assert!(!same_network(ip("127.0.0.1"), Some(HOME), &[]));
    }
}
