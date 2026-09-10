//! The address of a box this module is allowed to speak to.

use std::fmt;
use std::net::{IpAddr, SocketAddr};

use serde::Serialize;

/// An address nothing routes across the internet: private IPv4, loopback or
/// link-local, and the IPv6 equivalents. The only kind this module speaks to,
/// because the developer installer is handed the operator's Roku password, and
/// the only way to name a device at all.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct DeviceAddress(IpAddr);

impl DeviceAddress {
    pub fn new(ip: IpAddr) -> Option<Self> {
        behind_one_router(ip).then_some(Self(ip))
    }

    /// A literal address and never a name: resolving a name would let whoever
    /// answers the resolver choose where the password goes.
    pub fn parse(text: &str) -> Option<Self> {
        Self::new(text.trim().parse().ok()?)
    }

    /// `http://<address>:<port>`, with an IPv6 literal bracketed the way a URL
    /// authority requires.
    pub fn url(&self, port: u16) -> String {
        format!("http://{}", SocketAddr::new(self.0, port))
    }
}

impl fmt::Display for DeviceAddress {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

fn behind_one_router(ip: IpAddr) -> bool {
    match ip.to_canonical() {
        IpAddr::V4(v4) => v4.is_private() || v4.is_loopback() || v4.is_link_local(),
        IpAddr::V6(v6) => v6.is_loopback() || v6.is_unique_local() || v6.is_unicast_link_local(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn address(text: &str) -> Option<DeviceAddress> {
        DeviceAddress::parse(text)
    }

    #[test]
    fn an_address_on_this_network_is_one_nothing_routes_across_the_internet() {
        assert!(address("192.168.1.50").is_some());
        assert!(address("10.0.0.7").is_some());
        assert!(address("172.16.3.4").is_some());
        assert!(address("169.254.7.7").is_some());
        assert!(address("127.0.0.1").is_some());
        assert!(address("fd00::1").is_some());
        assert!(address("fe80::1").is_some());
        assert!(address("::1").is_some());
        assert!(address(" 192.168.1.50 ").is_some());
        assert!(address("::ffff:192.168.1.50").is_some());
    }

    #[test]
    fn an_address_shared_with_strangers_is_not_this_network() {
        assert_eq!(address("203.0.113.7"), None);
        assert_eq!(address("8.8.8.8"), None);
        assert_eq!(address("100.64.0.1"), None);
        assert_eq!(address("172.32.0.1"), None);
        assert_eq!(address("2001:db8::1"), None);
        assert_eq!(address("::ffff:203.0.113.7"), None);
    }

    #[test]
    fn an_address_that_names_no_box_is_refused() {
        assert_eq!(address("0.0.0.0"), None);
        assert_eq!(address("239.255.255.250"), None);
        assert_eq!(address("::"), None);
    }

    #[test]
    fn a_name_is_not_an_address_and_neither_is_an_address_with_anything_on_it() {
        assert_eq!(address("roku.local"), None);
        assert_eq!(address("attacker.example.com"), None);
        assert_eq!(address("localhost"), None);
        assert_eq!(address("192.168.1.50:8060"), None);
        assert_eq!(address("http://192.168.1.50"), None);
        assert_eq!(address(""), None);
    }

    #[test]
    fn a_url_brackets_an_ipv6_literal_and_leaves_ipv4_alone() {
        assert_eq!(
            address("192.168.1.50").unwrap().url(8060),
            "http://192.168.1.50:8060"
        );
        assert_eq!(address("fd00::1").unwrap().url(80), "http://[fd00::1]:80");
    }

    #[test]
    fn the_console_reads_an_address_as_the_plain_string_it_typed() {
        let address = address("192.168.1.50").unwrap();

        assert_eq!(serde_json::to_value(address).unwrap(), "192.168.1.50");
        assert_eq!(address.to_string(), "192.168.1.50");
    }
}
