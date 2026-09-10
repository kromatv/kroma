//! SSDP discovery: one M-SEARCH for `roku:ecp`, and every box on this network
//! that answers within the window.

use std::collections::BTreeMap;
use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

use anyhow::{Context, Result};
use tokio::net::UdpSocket;

use crate::address::DeviceAddress;

const SSDP_ADDR: &str = "239.255.255.250:1900";
const WINDOW: Duration = Duration::from_secs(3);

const M_SEARCH: &str = "M-SEARCH * HTTP/1.1\r\n\
HOST: 239.255.255.250:1900\r\n\
MAN: \"ssdp:discover\"\r\n\
ST: roku:ecp\r\n\
MX: 2\r\n\r\n";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Found {
    pub serial: String,
    pub address: DeviceAddress,
}

pub async fn search() -> Result<Vec<Found>> {
    let sock = UdpSocket::bind(bind_addr())
        .await
        .context("bind the SSDP socket")?;
    sock.set_multicast_ttl_v4(2).ok();
    let target: SocketAddr = SSDP_ADDR.parse().expect("a literal multicast address");
    sock.send_to(M_SEARCH.as_bytes(), target)
        .await
        .context("send M-SEARCH")?;

    let mut found: BTreeMap<String, Found> = BTreeMap::new();
    let deadline = tokio::time::Instant::now() + WINDOW;
    let mut buf = [0u8; 2048];
    loop {
        let Ok(Ok((n, from))) = tokio::time::timeout_at(deadline, sock.recv_from(&mut buf)).await
        else {
            break;
        };
        if let Some(f) = parse_response(from.ip(), &String::from_utf8_lossy(&buf[..n])) {
            found.entry(f.serial.clone()).or_insert(f);
        }
    }
    Ok(found.into_values().collect())
}

fn bind_addr() -> SocketAddr {
    let ip = crate::lan::primary_lan_ip().unwrap_or(std::net::Ipv4Addr::UNSPECIFIED.into());
    SocketAddr::new(ip, 0)
}

/// The box that answered, at the address its packet came from. A reply's
/// `Location` is not read: it names whichever host the sender chose, and that
/// host is where the channel and the developer password would go.
pub fn parse_response(from: IpAddr, text: &str) -> Option<Found> {
    let address = DeviceAddress::new(from)?;
    let serial = text.lines().skip(1).find_map(serial_of)?;
    Some(Found { serial, address })
}

fn serial_of(line: &str) -> Option<String> {
    let (name, value) = line.split_once(':')?;
    if !name.trim().eq_ignore_ascii_case("usn") {
        return None;
    }
    value
        .trim()
        .strip_prefix("uuid:roku:ecp:")
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    const REPLY: &str = "HTTP/1.1 200 OK\r\n\
Cache-Control: max-age=3600\r\n\
ST: roku:ecp\r\n\
Location: http://192.168.1.134:8060/\r\n\
USN: uuid:roku:ecp:P0A070000007\r\n\r\n";

    fn from(ip: &str) -> IpAddr {
        ip.parse().unwrap()
    }

    #[test]
    fn a_roku_reply_yields_its_serial_and_the_address_its_packet_came_from() {
        let found = parse_response(from("192.168.1.134"), REPLY).unwrap();

        assert_eq!(found.serial, "P0A070000007");
        assert_eq!(found.address.to_string(), "192.168.1.134");
    }

    #[test]
    fn the_host_a_location_names_is_never_the_host_that_gets_listed() {
        let elsewhere = REPLY.replace("http://192.168.1.134:8060/", "http://203.0.113.7:8060/");
        let neighbour = REPLY.replace("http://192.168.1.134:8060/", "http://192.168.1.7:8060/");

        let public = parse_response(from("192.168.1.134"), &elsewhere).unwrap();
        let private = parse_response(from("192.168.1.134"), &neighbour).unwrap();

        assert_eq!(public.address.to_string(), "192.168.1.134");
        assert_eq!(private.address.to_string(), "192.168.1.134");
    }

    #[test]
    fn a_reply_from_off_this_network_is_dropped_whatever_its_location_claims() {
        assert_eq!(parse_response(from("203.0.113.7"), REPLY), None);
        assert_eq!(parse_response(from("100.64.0.1"), REPLY), None);
        assert_eq!(parse_response(from("2001:db8::1"), REPLY), None);
    }

    #[test]
    fn a_reply_from_something_that_is_not_a_roku_is_dropped() {
        let text =
            "HTTP/1.1 200 OK\r\nLocation: http://10.0.0.2:1400/xml\r\nUSN: uuid:RINCON_1\r\n\r\n";

        assert_eq!(parse_response(from("10.0.0.2"), text), None);
    }

    #[test]
    fn the_socket_binds_on_the_lan_side_and_asks_for_any_port() {
        let addr = bind_addr();

        assert_eq!(addr.port(), 0);
        assert!(!addr.ip().is_loopback());
    }

    #[test]
    fn the_search_asks_for_rokus_alone() {
        assert!(M_SEARCH.contains("ST: roku:ecp\r\n"));
        assert!(M_SEARCH.ends_with("\r\n\r\n"));
    }
}
