//! Resolving a request's host once, refusing anything off the public internet,
//! and pinning curl to the address that was checked.

use std::net::{IpAddr, SocketAddr, ToSocketAddrs};

use anyhow::{bail, Context, Result};

use crate::address::{is_public, web_target, WebTarget};
use crate::config::option_line;

// Resolving here and handing curl the vetted address is what defeats DNS
// rebinding: curl never asks the resolver again, so the name cannot point at
// a private address between the check and the connect.
pub(crate) fn public_resolve_line(url: &str) -> Result<String> {
    let WebTarget { host, port, .. } =
        web_target(url).with_context(|| format!("{url} is not a plain http or https URL"))?;
    if let Ok(literal) = host.parse::<IpAddr>() {
        ensure_public(&host, literal)?;
        return Ok(String::new());
    }
    let addrs: Vec<SocketAddr> = (host.as_str(), port)
        .to_socket_addrs()
        .with_context(|| format!("resolve {host}"))?
        .collect();
    let Some(first) = addrs.first() else {
        bail!("{host} resolved to no address");
    };
    for addr in &addrs {
        ensure_public(&host, addr.ip())?;
    }
    let pinned = match first.ip() {
        IpAddr::V4(v4) => v4.to_string(),
        IpAddr::V6(v6) => format!("[{v6}]"),
    };
    Ok(option_line("resolve", &format!("{host}:{port}:{pinned}")))
}

fn ensure_public(host: &str, ip: IpAddr) -> Result<()> {
    if !is_public(ip) {
        bail!("{host} resolves to {ip}, which is not a public internet address");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_public_literal_needs_no_pin() {
        assert_eq!(public_resolve_line("https://1.1.1.1/x").unwrap(), "");
    }

    #[test]
    fn a_private_or_loopback_literal_is_refused() {
        for url in [
            "http://127.0.0.1:4040/api/_host/settings",
            "https://192.168.1.1/",
            "https://[::1]/",
            "https://[fe80::1]:8443/",
            "http://169.254.169.254/latest/meta-data",
        ] {
            let err = public_resolve_line(url).unwrap_err().to_string();
            assert!(
                err.contains("not a public internet address"),
                "{url}: {err}"
            );
        }
    }

    #[test]
    fn a_name_that_resolves_to_loopback_is_refused() {
        let err = public_resolve_line("https://localhost:9/")
            .unwrap_err()
            .to_string();

        assert!(err.contains("not a public internet address"), "{err}");
    }

    #[test]
    fn a_url_without_a_web_scheme_is_refused() {
        assert!(public_resolve_line("ftp://example.com/x").is_err());
        assert!(public_resolve_line("not a url").is_err());
    }
}
