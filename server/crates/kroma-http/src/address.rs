//! Which addresses belong to the public internet.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// What a web URL points at, read without resolving anything.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WebTarget {
    pub https: bool,
    pub host: String,
    pub port: u16,
}

impl WebTarget {
    /// The host as an address, when the URL names one literally.
    pub fn literal(&self) -> Option<IpAddr> {
        self.host.parse().ok()
    }
}

/// The target of an absolute `http` or `https` URL. `None` for any other
/// scheme, a URL with no host, or one carrying credentials (`user@host`),
/// which can disguise where a URL really goes.
pub fn web_target(url: &str) -> Option<WebTarget> {
    let uri: hyper::Uri = url.parse().ok()?;
    let authority = uri.authority()?;
    if authority.as_str().contains('@') {
        return None;
    }
    let https = match uri.scheme_str()? {
        "https" => true,
        "http" => false,
        _ => return None,
    };
    let port = uri.port_u16().unwrap_or(if https { 443 } else { 80 });
    let host = authority
        .host()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_string();
    if host.is_empty() {
        return None;
    }
    Some(WebTarget { https, host, port })
}

/// Whether `ip` is routable on the public internet: not loopback, private,
/// shared (CGNAT), link-local, multicast, documentation, benchmarking or
/// reserved space. An IPv6 address that embeds an IPv4 one (mapped, NAT64,
/// 6to4) is judged by the IPv4 address it reaches.
pub fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_public_v4(v4),
        IpAddr::V6(v6) => is_public_v6(v6),
    }
}

fn is_public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    let reserved = a == 0
        || a == 10
        || a == 127
        || (a == 100 && (64..128).contains(&b))
        || (a == 169 && b == 254)
        || (a == 172 && (16..32).contains(&b))
        || (a == 192 && b == 0 && c == 0)
        || (a == 192 && b == 0 && c == 2)
        || (a == 192 && b == 88 && c == 99)
        || (a == 192 && b == 168)
        || (a == 198 && (18..20).contains(&b))
        || (a == 198 && b == 51 && c == 100)
        || (a == 203 && b == 0 && c == 113)
        || a >= 224;
    !reserved
}

fn is_public_v6(ip: Ipv6Addr) -> bool {
    if let Some(v4) = embedded_v4(ip) {
        return is_public_v4(v4);
    }
    let s = ip.segments();
    let reserved = ip.is_unspecified()
        || ip.is_loopback()
        || s[0..6] == [0; 6]
        || (s[0] == 0x0100 && s[1..4] == [0; 3])
        || (s[0] == 0x2001 && s[1] == 0x0db8)
        || (s[0] & 0xfe00) == 0xfc00
        || (s[0] & 0xffc0) == 0xfe80
        || (s[0] & 0xffc0) == 0xfec0
        || (s[0] & 0xff00) == 0xff00;
    !reserved
}

fn embedded_v4(ip: Ipv6Addr) -> Option<Ipv4Addr> {
    let s = ip.segments();
    let tail = |hi: u16, lo: u16| Ipv4Addr::from((u32::from(hi) << 16) | u32::from(lo));
    if s[0..5] == [0; 5] && s[5] == 0xffff {
        return Some(tail(s[6], s[7]));
    }
    if s[0] == 0x0064 && s[1] == 0xff9b && s[2..6] == [0; 4] {
        return Some(tail(s[6], s[7]));
    }
    if s[0] == 0x2002 {
        return Some(tail(s[1], s[2]));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn public(ip: &str) -> bool {
        is_public(ip.parse().unwrap())
    }

    #[test]
    fn internet_addresses_are_public() {
        for ip in [
            "1.1.1.1",
            "104.20.23.154",
            "172.32.0.1",
            "100.128.0.1",
            "2606:4700::1111",
        ] {
            assert!(public(ip), "{ip}");
        }
    }

    #[test]
    fn every_non_internet_ipv4_range_is_refused() {
        for ip in [
            "0.0.0.0",
            "10.1.2.3",
            "100.64.0.1",
            "127.0.0.1",
            "169.254.169.254",
            "172.16.0.1",
            "172.31.255.255",
            "192.0.0.8",
            "192.0.2.1",
            "192.88.99.1",
            "192.168.1.1",
            "198.18.0.1",
            "198.51.100.1",
            "203.0.113.1",
            "224.0.0.251",
            "239.255.255.250",
            "240.0.0.1",
            "255.255.255.255",
        ] {
            assert!(!public(ip), "{ip}");
        }
    }

    #[test]
    fn every_non_internet_ipv6_range_is_refused() {
        for ip in [
            "::",
            "::1",
            "::10.0.0.1",
            "100::1",
            "2001:db8::1",
            "fc00::1",
            "fd12:3456::1",
            "fe80::1",
            "fec0::1",
            "ff02::fb",
        ] {
            assert!(!public(ip), "{ip}");
        }
    }

    #[test]
    fn a_web_target_takes_its_port_from_the_scheme_when_none_is_written() {
        assert_eq!(
            web_target("https://push.example/v2"),
            Some(WebTarget {
                https: true,
                host: "push.example".into(),
                port: 443
            })
        );
        assert_eq!(web_target("http://push.example:8080/").unwrap().port, 8080);
        assert_eq!(
            web_target("https://[2001:db8::1]/").unwrap().literal(),
            Some("2001:db8::1".parse().unwrap())
        );
    }

    #[test]
    fn a_url_that_is_not_plainly_a_web_address_has_no_target() {
        for url in [
            "ftp://push.example/",
            "file:///etc/passwd",
            "https://user:pass@push.example/",
            "https://push.example@127.0.0.1/",
            "/relative/path",
            "not a url",
        ] {
            assert_eq!(web_target(url), None, "{url}");
        }
    }

    #[test]
    fn an_ipv6_address_is_judged_by_the_ipv4_address_it_embeds() {
        assert!(!public("::ffff:127.0.0.1"));
        assert!(!public("::ffff:192.168.1.1"));
        assert!(!public("64:ff9b::10.0.0.1"));
        assert!(!public("2002:c0a8:0101::1"));
        assert!(public("::ffff:1.1.1.1"));
        assert!(public("64:ff9b::1.1.1.1"));
    }
}
