//! Where a Roku on the LAN reaches this server: the core's port, on the
//! address the routing table would use to leave the box.

use std::net::{IpAddr, UdpSocket};

pub fn server_url() -> Option<String> {
    let port = core_port(&std::env::var("KROMA_CORE_URL").ok()?)?;
    let ip = primary_lan_ip()?;
    Some(format!("http://{ip}:{port}"))
}

pub fn core_port(core_url: &str) -> Option<u16> {
    core_url
        .trim_end_matches('/')
        .rsplit(':')
        .next()?
        .parse()
        .ok()
}

pub fn primary_lan_ip() -> Option<IpAddr> {
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("8.8.8.8:80").ok()?;
    let ip = sock.local_addr().ok()?.ip();
    (!ip.is_loopback() && !ip.is_unspecified()).then_some(ip)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_port_is_read_off_the_core_url_with_or_without_a_trailing_slash() {
        assert_eq!(core_port("http://127.0.0.1:4040"), Some(4040));
        assert_eq!(core_port("http://127.0.0.1:4040/"), Some(4040));
        assert_eq!(core_port("http://kroma.local"), None);
    }

    #[test]
    fn the_lan_address_is_never_one_a_roku_could_not_reach() {
        let ip = primary_lan_ip();
        assert!(
            ip.is_none_or(|a| !a.is_loopback() && !a.is_unspecified()),
            "{ip:?}"
        );
    }
}
