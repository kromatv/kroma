//! Built on hyper's own client, which cannot follow a redirect: a sidecar
//! answering 302 is trying to move the core somewhere, and the only correct
//! destination is the one the supervisor named.

#![expect(
    clippy::disallowed_types,
    reason = "the loopback seam: send refuses any URL that is not plain http to a loopback address, so this client never leaves the machine"
)]

use std::sync::OnceLock;

use anyhow::{bail, Context, Result};
use bytes::Bytes;
use http_body_util::Full;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::client::legacy::Client;
use hyper_util::rt::TokioExecutor;

use super::exchange::{exchange, prepared};
use super::transport::{Request, Transport};
use crate::response::Response;

/// Pooled HTTP/1.1 to another process on this machine.
#[derive(Debug, Default)]
pub struct Tcp;

impl Transport for Tcp {
    fn name(&self) -> &'static str {
        "tcp"
    }

    fn accepts(&self, url: &str) -> bool {
        is_loopback(url).unwrap_or(false)
    }

    fn send(&self, request: &Request<'_>) -> Result<Response> {
        ensure_loopback(request.url)?;
        let prepared = prepared(request, request.url)?;
        exchange(request.timeout, async move {
            client()
                .request(prepared)
                .await
                .context("send the loopback request")
        })
    }
}

fn client() -> &'static Client<HttpConnector, Full<Bytes>> {
    static CLIENT: OnceLock<Client<HttpConnector, Full<Bytes>>> = OnceLock::new();
    CLIENT.get_or_init(|| Client::builder(TokioExecutor::new()).build_http())
}

fn is_loopback(url: &str) -> Result<bool> {
    let uri: hyper::Uri = url.parse().with_context(|| format!("parse the URL: {url}"))?;
    if uri.scheme_str() != Some("http") {
        return Ok(false);
    }
    let Some(host) = uri.host() else {
        return Ok(false);
    };
    // An IPv6 host keeps its brackets through `host`, and loopback is a range
    // rather than the one literal the supervisor happens to hand out, so this
    // parses rather than matching strings.
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    Ok(bare == "localhost"
        || bare
            .parse::<std::net::IpAddr>()
            .is_ok_and(|ip| ip.is_loopback()))
}

fn ensure_loopback(url: &str) -> Result<()> {
    if !is_loopback(url)? {
        bail!("the tcp transport refuses {url}: not plain http on this machine");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_host_that_is_not_loopback_is_refused() {
        let err = ensure_loopback("http://example.com/_port/x")
            .unwrap_err()
            .to_string();
        assert!(err.contains("example.com"), "{err}");
    }

    #[test]
    fn every_spelling_of_this_machine_is_accepted() {
        assert!(Tcp.accepts("http://127.0.0.1:9/_port/x"));
        assert!(Tcp.accepts("http://localhost:9/_port/x"));
        assert!(Tcp.accepts("http://[::1]:9/_port/x"));
        assert!(Tcp.accepts("http://127.0.0.2:9/_port/x"));
    }

    #[test]
    fn an_address_outside_the_loopback_range_is_refused() {
        assert!(!Tcp.accepts("http://10.0.0.5:9/_port/x"));
        assert!(!Tcp.accepts("http://169.254.169.254/latest/meta-data"));
    }

    #[test]
    fn a_tls_url_is_refused_because_this_seam_has_no_tls_stack() {
        assert!(!Tcp.accepts("https://127.0.0.1:9/_port/x"));
    }

    #[test]
    fn an_unparseable_url_is_refused_rather_than_panicking() {
        assert!(!Tcp.accepts("not a url"));
        assert!(ensure_loopback("not a url").is_err());
    }
}
