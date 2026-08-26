//! Built on hyper's own client rather than a batteries-included one: axum
//! already puts hyper in every sidecar, and a peer at 127.0.0.1 needs none of
//! the TLS, proxy or cookie machinery the size would buy. It also cannot follow
//! a redirect, which is what this seam wants -- a sidecar answering 302 is
//! trying to move the core somewhere, and the only correct destination is the
//! one the supervisor named.

use std::sync::OnceLock;

use anyhow::{bail, Context, Result};
use bytes::Bytes;
use http_body_util::{BodyExt, Full, Limited};
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::client::legacy::Client;
use hyper_util::rt::TokioExecutor;

use super::transport::{Request, Transport};
use crate::response::Response;

/// Memory guard on a response body: what one wrong peer may make this process
/// allocate, not a size any real payload on the seam approaches.
pub const MAX_BODY_BYTES: usize = 64 * 1024 * 1024;

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
        let mut prepared = hyper::Request::builder()
            .method(request.method.as_str())
            .uri(request.url);
        for (name, value) in request.headers {
            prepared = prepared.header(name, value);
        }
        let body = match request.body {
            Some((content_type, bytes)) => {
                prepared = prepared.header("content-type", content_type);
                Bytes::copy_from_slice(bytes)
            }
            None => Bytes::new(),
        };
        let prepared = prepared
            .body(Full::new(body))
            .context("build the loopback request")?;
        let timeout = request.timeout;
        block_on(async move {
            let response = tokio::time::timeout(timeout, client().request(prepared))
                .await
                .context("the loopback peer did not answer in time")?
                .context("send the loopback request")?;
            let status = response.status().as_u16();
            let headers = response
                .headers()
                .iter()
                .map(|(name, value)| {
                    (
                        name.as_str().to_string(),
                        String::from_utf8_lossy(value.as_bytes()).into_owned(),
                    )
                })
                .collect();
            let body = Limited::new(response.into_body(), MAX_BODY_BYTES)
                .collect()
                .await
                .map_err(|e| anyhow::anyhow!("read the loopback response body: {e}"))?;
            Ok(Response {
                status,
                headers,
                body: body.to_bytes().to_vec(),
            })
        })
    }
}

fn client() -> &'static Client<HttpConnector, Full<Bytes>> {
    static CLIENT: OnceLock<Client<HttpConnector, Full<Bytes>>> = OnceLock::new();
    CLIENT.get_or_init(|| Client::builder(TokioExecutor::new()).build_http())
}

// `Handle::block_on` panics on a worker thread and `spawn_blocking` threads still
// carry the ambient handle, so the work goes to a runtime that is not the
// caller's.
fn runtime() -> &'static tokio::runtime::Runtime {
    static RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .thread_name("kroma-loopback")
            .enable_all()
            .build()
            .expect("build the loopback runtime")
    })
}

// A sidecar builds with `panic = "abort"`, so a panic here would take the whole
// module process down where the caller expects a recoverable error.
fn block_on<T>(future: impl std::future::Future<Output = Result<T>> + Send + 'static) -> Result<T>
where
    T: Send + 'static,
{
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    runtime().spawn(async move {
        let _ = tx.send(future.await);
    });
    match rx.recv() {
        Ok(outcome) => outcome,
        Err(_) => bail!("the loopback exchange ended without a response"),
    }
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
