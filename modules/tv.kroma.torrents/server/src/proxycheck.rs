//! VPN reachability probe for the kill switch: fetch an IP-echo endpoint
//! through the SOCKS5 proxy, plus (best-effort) directly, and compare. A dead
//! proxy and a proxy that is not diverting traffic both read as "not sealed".

#[derive(Debug, Clone, Default)]
pub struct VpnCheck {
    pub proxied_ip: Option<String>,
    pub direct_ip: Option<String>,
    pub error: Option<String>,
}

impl VpnCheck {
    /// Proxied egress works and, when a direct comparison exists, differs from
    /// the direct route.
    pub fn sealed(&self) -> bool {
        match (&self.proxied_ip, &self.direct_ip) {
            (Some(p), Some(d)) => p != d,
            (Some(_), None) => true,
            (None, _) => false,
        }
    }
}

fn short_ip(body: String) -> Option<String> {
    let trimmed = body.trim();
    // IP echo endpoints answer a bare address; anything page-sized is a
    // captive portal / error page, not an IP.
    (!trimmed.is_empty() && trimmed.len() <= 64).then(|| trimmed.to_string())
}

/// Probe `check_url` through `proxy` (`socks5://[user:pass@]host:port` or
/// `host:port`) and directly.
pub fn check(proxy: &str, check_url: &str) -> VpnCheck {
    let proxied = kroma_module_sdk::http::Fetch::new()
        .max_time(12)
        .socks5(proxy.trim().trim_start_matches("socks5://"))
        .get(check_url)
        .and_then(|r| r.ensure_ok())
        .map(|r| r.text());
    let direct = kroma_module_sdk::http::Fetch::new()
        .max_time(12)
        .get(check_url)
        .and_then(|r| r.ensure_ok())
        .map(|r| r.text());
    let mut out = VpnCheck::default();
    match proxied {
        Ok(body) => out.proxied_ip = short_ip(body),
        Err(e) => out.error = Some(format!("{e:#}")),
    }
    if let Ok(body) = direct {
        out.direct_ip = short_ip(body);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sealed_logic() {
        let mk = |p: Option<&str>, d: Option<&str>| VpnCheck {
            proxied_ip: p.map(str::to_string),
            direct_ip: d.map(str::to_string),
            error: None,
        };
        assert!(mk(Some("1.2.3.4"), Some("5.6.7.8")).sealed());
        assert!(mk(Some("1.2.3.4"), None).sealed(), "no direct egress still counts");
        assert!(!mk(None, Some("5.6.7.8")).sealed(), "dead proxy is not sealed");
        assert!(!mk(Some("5.6.7.8"), Some("5.6.7.8")).sealed(), "same exit = not diverting");
    }

    #[test]
    fn ip_echo_bodies_are_size_capped() {
        assert_eq!(short_ip("  203.0.113.7\n".into()).as_deref(), Some("203.0.113.7"));
        assert_eq!(short_ip("<html>captive portal</html>".repeat(10)), None);
        assert_eq!(short_ip("   ".into()), None);
    }

    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn http_echo(body: &'static str) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                read_http_request(&mut stream);
                write_http_response(&mut stream, body);
            }
        });
        format!("http://127.0.0.1:{port}/ip")
    }

    fn socks5_echo(body: &'static str) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                if socks5_handshake(&mut stream).is_none() {
                    continue;
                }
                read_http_request(&mut stream);
                write_http_response(&mut stream, body);
            }
        });
        format!("127.0.0.1:{port}")
    }

    fn socks5_handshake(stream: &mut std::net::TcpStream) -> Option<()> {
        let mut greeting = [0u8; 2];
        stream.read_exact(&mut greeting).ok()?;
        let mut methods = vec![0u8; greeting[1] as usize];
        stream.read_exact(&mut methods).ok()?;
        stream.write_all(&[0x05, 0x00]).ok()?;

        let mut head = [0u8; 4];
        stream.read_exact(&mut head).ok()?;
        let addr_len = match head[3] {
            0x01 => 4,
            0x04 => 16,
            _ => {
                let mut len = [0u8; 1];
                stream.read_exact(&mut len).ok()?;
                len[0] as usize
            }
        };
        let mut rest = vec![0u8; addr_len + 2];
        stream.read_exact(&mut rest).ok()?;
        stream.write_all(&[0x05, 0, 0, 0x01, 0, 0, 0, 0, 0, 0]).ok()?;
        Some(())
    }

    fn read_http_request(stream: &mut std::net::TcpStream) {
        let mut seen = Vec::new();
        let mut byte = [0u8; 1];
        while stream.read_exact(&mut byte).is_ok() {
            seen.push(byte[0]);
            if seen.ends_with(b"\r\n\r\n") {
                break;
            }
        }
    }

    fn write_http_response(stream: &mut std::net::TcpStream, body: &str) {
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let _ = stream.write_all(resp.as_bytes());
        let _ = stream.flush();
    }

    #[test]
    fn a_proxy_whose_exit_differs_from_the_direct_route_is_sealed() {
        let out = check(&socks5_echo("198.51.100.9"), &http_echo("203.0.113.7"));
        assert_eq!(out.proxied_ip.as_deref(), Some("198.51.100.9"));
        assert_eq!(out.direct_ip.as_deref(), Some("203.0.113.7"));
        assert_eq!(out.error, None);
        assert!(out.sealed());
    }

    #[test]
    fn a_socks5_url_is_accepted_as_well_as_a_bare_host_port() {
        let proxy = format!("socks5://{}", socks5_echo("198.51.100.9"));
        let out = check(&proxy, &http_echo("203.0.113.7"));
        assert_eq!(out.proxied_ip.as_deref(), Some("198.51.100.9"));
        assert!(out.sealed());
    }

    #[test]
    fn a_dead_proxy_records_the_reason_and_is_never_sealed() {
        let out = check("127.0.0.1:1", &http_echo("203.0.113.7"));
        assert_eq!(out.proxied_ip, None);
        assert!(out.error.is_some(), "a dead proxy must say why");
        assert_eq!(out.direct_ip.as_deref(), Some("203.0.113.7"));
        assert!(!out.sealed());
    }

    #[test]
    fn an_unreachable_check_url_leaves_both_sides_unknown() {
        let out = check("127.0.0.1:1", "http://127.0.0.1:1/ip");
        assert_eq!(out.proxied_ip, None);
        assert_eq!(out.direct_ip, None);
        assert!(out.error.is_some());
        assert!(!out.sealed());
    }
}
