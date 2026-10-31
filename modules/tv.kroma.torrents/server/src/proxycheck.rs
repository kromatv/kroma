//! VPN reachability probe for the kill switch: fetch an IP-echo endpoint
//! through the SOCKS5 proxy, plus (best-effort) directly, and compare. A dead
//! proxy and a proxy that is not diverting traffic both read as "not sealed".

use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

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
/// `host:port`) and compare with the direct route, whose answer is kept while
/// the tunnel's exit holds: asked every time, it would pair our real address
/// with each exit for the echo service.
pub fn check(proxy: &str, check_url: &str) -> VpnCheck {
    let proxied = echo(check_url, Some(proxy));
    let mut out = VpnCheck::default();
    match proxied {
        Ok(body) => out.proxied_ip = short_ip(body),
        Err(e) => out.error = Some(format!("{e:#}")),
    }
    out.direct_ip = direct_ip(check_url, out.proxied_ip.as_deref());
    out
}

const DIRECT_PROBE_EVERY: Duration = Duration::from_secs(6 * 60 * 60);

struct DirectProbe {
    at: Instant,
    exit: Option<String>,
    direct: Option<String>,
}

static DIRECT_PROBES: Mutex<Option<HashMap<String, DirectProbe>>> = Mutex::new(None);

fn direct_ip(check_url: &str, exit: Option<&str>) -> Option<String> {
    let mut probes = DIRECT_PROBES.lock().unwrap_or_else(PoisonError::into_inner);
    let probes = probes.get_or_insert_with(HashMap::new);
    if let Some(kept) = probes.get(check_url) {
        if kept.at.elapsed() < DIRECT_PROBE_EVERY && kept.exit.as_deref() == exit {
            return kept.direct.clone();
        }
    }
    let direct = echo(check_url, None).ok().and_then(short_ip);
    probes.insert(
        check_url.to_string(),
        DirectProbe {
            at: Instant::now(),
            exit: exit.map(str::to_string),
            direct: direct.clone(),
        },
    );
    direct
}

fn echo(check_url: &str, proxy: Option<&str>) -> anyhow::Result<String> {
    let mut fetch = kroma_module_sdk::http::Fetch::new().max_time(12);
    if let Some(proxy) = proxy {
        fetch = fetch.socks5(proxy);
    }
    Ok(fetch.get(check_url)?.ensure_ok()?.text())
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::Ordering;

    use super::*;
    use crate::test_support::{counting_http_echo, http_echo, socks5_echo, socks5_serving};

    #[test]
    fn sealed_logic() {
        let mk = |p: Option<&str>, d: Option<&str>| VpnCheck {
            proxied_ip: p.map(str::to_string),
            direct_ip: d.map(str::to_string),
            error: None,
        };
        assert!(mk(Some("1.2.3.4"), Some("5.6.7.8")).sealed());
        assert!(
            mk(Some("1.2.3.4"), None).sealed(),
            "no direct egress still counts"
        );
        assert!(
            !mk(None, Some("5.6.7.8")).sealed(),
            "dead proxy is not sealed"
        );
        assert!(
            !mk(Some("5.6.7.8"), Some("5.6.7.8")).sealed(),
            "same exit = not diverting"
        );
    }

    #[test]
    fn ip_echo_bodies_are_size_capped() {
        assert_eq!(
            short_ip("  203.0.113.7\n".into()).as_deref(),
            Some("203.0.113.7")
        );
        assert_eq!(short_ip("<html>captive portal</html>".repeat(10)), None);
        assert_eq!(short_ip("   ".into()), None);
    }

    #[test]
    fn the_direct_route_is_asked_once_while_the_exit_stays_put() {
        let (url, direct_hits) = counting_http_echo("203.0.113.7");
        let proxy = socks5_echo("198.51.100.9");

        let first = check(&proxy, &url);
        let second = check(&proxy, &url);

        assert_eq!(first.direct_ip.as_deref(), Some("203.0.113.7"));
        assert_eq!(second.direct_ip, first.direct_ip);
        assert_eq!(direct_hits.load(Ordering::SeqCst), 1);
        assert!(second.sealed());
    }

    #[test]
    fn a_new_tunnel_exit_asks_the_direct_route_again() {
        let (url, direct_hits) = counting_http_echo("203.0.113.7");

        check(&socks5_echo("198.51.100.9"), &url);
        check(&socks5_echo("198.51.100.10"), &url);

        assert_eq!(direct_hits.load(Ordering::SeqCst), 2);
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
    fn the_proxy_is_given_the_hostname_to_resolve_rather_than_an_address_we_resolved() {
        let url = http_echo("203.0.113.7").replace("127.0.0.1", "localhost");
        let (proxy, asked) = socks5_serving(b"198.51.100.9".to_vec());

        let out = check(&proxy, &url);

        let seen = asked.try_recv().unwrap();
        assert!(seen.target.starts_with("localhost:"));
        assert!(seen.request.starts_with("GET /ip "));
        assert_eq!(out.proxied_ip.as_deref(), Some("198.51.100.9"));
        assert_eq!(out.error, None);
        assert!(out.sealed());
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
