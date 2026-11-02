//! SSDP discovery: one M-SEARCH for `roku:ecp`, and every box on this network
//! that answers within the window.

use std::collections::BTreeMap;
use std::net::IpAddr;
use std::time::Duration;

use anyhow::Result;
use kroma_module_sdk::host::{lan, run_blocking};

use crate::address::DeviceAddress;

const SEARCH_TARGET: &str = "roku:ecp";
const WINDOW: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Found {
    pub serial: String,
    pub address: DeviceAddress,
}

pub async fn search() -> Result<Vec<Found>> {
    let replies = run_blocking(|| lan::search(SEARCH_TARGET, WINDOW))
        .await
        .map_err(|error| anyhow::anyhow!("{error}"))?
        .map_err(anyhow::Error::msg)?;
    let mut found: BTreeMap<String, Found> = BTreeMap::new();
    for reply in replies {
        let Ok(from) = reply.source.parse() else {
            continue;
        };
        if let Some(f) = parse_response(from, &reply.headers) {
            found.entry(f.serial.clone()).or_insert(f);
        }
    }
    Ok(found.into_values().collect())
}

/// The box that answered, at the address its packet came from. A reply's
/// `Location` is not read: it names whichever host the sender chose, and that
/// host is where the channel and the developer password would go.
pub fn parse_response(from: IpAddr, headers: &[(String, String)]) -> Option<Found> {
    let address = DeviceAddress::new(from)?;
    let serial = headers.iter().find_map(|(name, value)| serial_of(name, value))?;
    Some(Found { serial, address })
}

fn serial_of(name: &str, value: &str) -> Option<String> {
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

    fn headers(text: &str) -> Vec<(String, String)> {
        text.lines()
            .skip(1)
            .filter_map(|line| line.split_once(':'))
            .map(|(name, value)| (name.trim().to_ascii_lowercase(), value.trim().to_string()))
            .collect()
    }

    #[test]
    fn a_roku_reply_yields_its_serial_and_the_address_its_packet_came_from() {
        let found = parse_response(from("192.168.1.134"), &headers(REPLY)).unwrap();

        assert_eq!(found.serial, "P0A070000007");
        assert_eq!(found.address.to_string(), "192.168.1.134");
    }

    #[test]
    fn the_host_a_location_names_is_never_the_host_that_gets_listed() {
        let elsewhere = REPLY.replace("http://192.168.1.134:8060/", "http://203.0.113.7:8060/");
        let neighbour = REPLY.replace("http://192.168.1.134:8060/", "http://192.168.1.7:8060/");

        let public = parse_response(from("192.168.1.134"), &headers(&elsewhere)).unwrap();
        let private = parse_response(from("192.168.1.134"), &headers(&neighbour)).unwrap();

        assert_eq!(public.address.to_string(), "192.168.1.134");
        assert_eq!(private.address.to_string(), "192.168.1.134");
    }

    #[test]
    fn a_reply_from_off_this_network_is_dropped_whatever_its_location_claims() {
        assert_eq!(parse_response(from("203.0.113.7"), &headers(REPLY)), None);
        assert_eq!(parse_response(from("100.64.0.1"), &headers(REPLY)), None);
        assert_eq!(parse_response(from("2001:db8::1"), &headers(REPLY)), None);
    }

    #[test]
    fn a_reply_from_something_that_is_not_a_roku_is_dropped() {
        let text =
            "HTTP/1.1 200 OK\r\nLocation: http://10.0.0.2:1400/xml\r\nUSN: uuid:RINCON_1\r\n\r\n";

        assert_eq!(parse_response(from("10.0.0.2"), &headers(text)), None);
    }
}
