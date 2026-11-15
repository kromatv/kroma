//! LAN/WAN classification of a client IP, against the configured local networks.

use std::net::IpAddr;

/// Classify a client IP as `LAN` or `WAN` against the configured local networks
/// (a CIDR of either family, or a bare IPv4 prefix like `192.168.`). Loopback is
/// always LAN.
pub fn classify_network(ip: &str, local_nets: &[String]) -> String {
    if is_lan(ip, local_nets) {
        "LAN".into()
    } else {
        "WAN".into()
    }
}

/// Whether a client IP counts as LAN: loopback, an RFC1918 / link-local / IPv6
/// unique-local address, an IPv6 address inside a /64 this machine holds (all
/// local regardless of config), or a match against a configured local network.
/// Backs both the session label and the dashboard's LAN/WAN byte-throughput
/// split. An unparseable IP is treated as WAN.
pub fn is_lan(ip: &str, local_nets: &[String]) -> bool {
    let Ok(addr) = ip.parse::<IpAddr>() else {
        return false;
    };
    let addr = addr.to_canonical();
    addr.is_loopback()
        || is_private(&addr)
        || local_nets.iter().any(|net| cidr_contains(net, &addr))
        || crate::services::direct::is_neighbour(addr)
}

fn is_private(addr: &IpAddr) -> bool {
    match addr {
        IpAddr::V4(v4) => v4.is_private() || v4.is_link_local(),
        IpAddr::V6(v6) => v6.is_unique_local() || v6.is_unicast_link_local(),
    }
}

/// CIDR match for either family (`a.b.c.d/n`, `2001:db8::/56`), plus bare
/// `a.b.` IPv4 prefixes. A range only ever holds an address of its own family.
/// Public because the trusted-proxy list is matched the same way, and two
/// parsers for one syntax is one too many.
pub fn cidr_contains(net: &str, addr: &IpAddr) -> bool {
    let addr = addr.to_canonical();
    let Some((base, bits)) = net.split_once('/') else {
        return matches!(addr, IpAddr::V4(ip) if ip.to_string().starts_with(net.trim()));
    };
    let Ok(bits) = bits.trim().parse::<u32>() else {
        return false;
    };
    match (base.trim().parse::<IpAddr>(), addr) {
        (Ok(IpAddr::V4(base)), IpAddr::V4(ip)) => {
            shares_leading_bits(u32::from(base).into(), u32::from(ip).into(), bits, 32)
        }
        (Ok(IpAddr::V6(base)), IpAddr::V6(ip)) => {
            shares_leading_bits(u128::from(base), u128::from(ip), bits, 128)
        }
        _ => false,
    }
}

fn shares_leading_bits(a: u128, b: u128, bits: u32, width: u32) -> bool {
    bits <= width && (bits == 0 || (a ^ b) >> (width - bits) == 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nets() -> Vec<String> {
        vec!["203.0.113.0/24".to_string(), "198.51.100.".to_string()]
    }

    #[test]
    fn loopback_and_private_are_lan_regardless_of_config() {
        assert_eq!(classify_network("127.0.0.1", &[]), "LAN");
        assert_eq!(classify_network("::1", &[]), "LAN");
        assert_eq!(classify_network("192.168.1.10", &[]), "LAN");
        assert_eq!(classify_network("10.1.2.3", &[]), "LAN");
        assert_eq!(classify_network("172.16.5.5", &[]), "LAN");
        assert_eq!(classify_network("169.254.1.1", &[]), "LAN"); // link-local
    }

    #[test]
    fn public_ip_is_wan_unless_in_configured_net() {
        assert_eq!(classify_network("8.8.8.8", &nets()), "WAN");
        // Inside the configured CIDR.
        assert_eq!(classify_network("203.0.113.42", &nets()), "LAN");
        // Inside the bare-prefix net.
        assert_eq!(classify_network("198.51.100.7", &nets()), "LAN");
        // Just outside both.
        assert_eq!(classify_network("203.0.114.1", &nets()), "WAN");
    }

    #[test]
    fn a_dual_stack_bind_hands_a_lan_client_over_mapped_and_it_is_still_lan() {
        assert_eq!(classify_network("::ffff:192.168.1.10", &nets()), "LAN");
        assert_eq!(classify_network("::ffff:127.0.0.1", &nets()), "LAN");
        assert_eq!(classify_network("::ffff:203.0.113.42", &nets()), "LAN");
        assert_eq!(classify_network("::ffff:8.8.8.8", &nets()), "WAN");
    }

    #[test]
    fn a_mapped_address_matches_an_ipv4_cidr() {
        let mapped: IpAddr = "::ffff:10.0.0.5".parse().unwrap();

        assert!(cidr_contains("10.0.0.0/8", &mapped));
        assert!(!cidr_contains("172.16.0.0/12", &mapped));
    }

    #[test]
    fn invalid_ip_is_wan() {
        assert_eq!(classify_network("not-an-ip", &nets()), "WAN");
        assert_eq!(classify_network("", &nets()), "WAN");
    }

    #[test]
    fn is_lan_mirrors_classify_network() {
        assert!(is_lan("127.0.0.1", &[]));
        assert!(is_lan("192.168.1.10", &[]));
        assert!(is_lan("203.0.113.42", &nets()));
        assert!(!is_lan("8.8.8.8", &nets()));
        assert!(!is_lan("not-an-ip", &nets()));
    }

    #[test]
    fn ipv6_ula_is_lan_global_is_wan() {
        assert_eq!(classify_network("fc00::1", &[]), "LAN"); // unique-local
        assert_eq!(classify_network("fd12:3456::1", &[]), "LAN");
        assert_eq!(classify_network("2001:4860:4860::8888", &[]), "WAN"); // global
    }

    #[test]
    fn an_ipv6_client_on_the_servers_own_link_is_lan() {
        assert_eq!(classify_network("fe80::1c2d:3e4f:5a6b:7c8d", &[]), "LAN");
        assert_eq!(classify_network("febf::1", &[]), "LAN");
        assert_eq!(classify_network("fec0::1", &[]), "WAN");
    }

    #[test]
    fn a_configured_ipv6_range_makes_its_addresses_lan() {
        let nets = vec!["2001:4860:1:200::/56".to_string()];

        assert_eq!(classify_network("2001:4860:1:2ff::9", &nets), "LAN");
        assert_eq!(classify_network("2001:4860:1:300::9", &nets), "WAN");
    }

    #[test]
    fn an_ipv6_range_holds_the_addresses_that_share_its_leading_bits() {
        let inside: IpAddr = "2001:db8:1:2::99".parse().unwrap();

        assert!(cidr_contains("2001:db8:1:2::/64", &inside));
        assert!(cidr_contains(" 2001:db8:1::/48 ", &inside));
        assert!(cidr_contains("2001:db8:1:2::99/128", &inside));
        assert!(cidr_contains("::/0", &inside));
        assert!(!cidr_contains("2001:db8:1:3::/64", &inside));
        assert!(!cidr_contains("2001:db8:1:2::98/128", &inside));
        assert!(!cidr_contains("2001:db8:1:2::/129", &inside));
        assert!(!cidr_contains("2001:db8:1:2::/xx", &inside));
        assert!(!cidr_contains("2001:db8:", &inside));
    }

    #[test]
    fn a_range_never_holds_an_address_of_the_other_family() {
        let v4: IpAddr = "10.0.0.5".parse().unwrap();
        let v6: IpAddr = "2001:db8::1".parse().unwrap();

        assert!(!cidr_contains("::/0", &v4));
        assert!(!cidr_contains("0.0.0.0/0", &v6));
    }

    #[test]
    fn cidr_contains_edge_cases() {
        let a: IpAddr = "10.0.0.5".parse().unwrap();
        // /0 always matches.
        assert!(cidr_contains("0.0.0.0/0", &a));
        // >32 bits is rejected.
        assert!(!cidr_contains("10.0.0.0/33", &a));
        // Bad base or bits parse -> false.
        assert!(!cidr_contains("notanip/8", &a));
        assert!(!cidr_contains("10.0.0.0/xx", &a));
        // Exact /32 match.
        assert!(cidr_contains("10.0.0.5/32", &a));
        assert!(!cidr_contains("10.0.0.6/32", &a));
        // IPv6 addr never matches an IPv4 CIDR.
        let v6: IpAddr = "2001:db8::1".parse().unwrap();
        assert!(!cidr_contains("10.0.0.0/8", &v6));
    }

    #[test]
    fn is_private_classifies_v4_and_v6() {
        assert!(is_private(&"192.168.0.1".parse().unwrap()));
        assert!(is_private(&"169.254.0.1".parse().unwrap()));
        assert!(!is_private(&"8.8.8.8".parse().unwrap()));
        assert!(is_private(&"fc00::1".parse().unwrap()));
        assert!(is_private(&"fe80::1".parse().unwrap()));
        assert!(!is_private(&"2001:db8::1".parse().unwrap()));
    }
}
