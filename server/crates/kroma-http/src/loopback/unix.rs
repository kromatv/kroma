//! One connection per exchange: connecting a Unix socket costs no handshake and
//! leaves no TIME_WAIT behind, which is all a pool saves on TCP.

use std::path::Path;

const SCHEME: &str = "http+unix://";

/// The base URL [`Loopback`](super::Loopback) reaches the HTTP server on the
/// Unix socket at `socket` through: the path, percent-encoded, as the host of
/// an `http+unix` URL. A caller appends `/path?query` to it as to any base.
pub fn unix_url(socket: &Path) -> String {
    let mut url = String::from(SCHEME);
    for &byte in path_bytes(socket).iter() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            url.push(char::from(byte));
        } else {
            url.push_str(&format!("%{byte:02X}"));
        }
    }
    url
}

#[cfg(unix)]
fn path_bytes(path: &Path) -> std::borrow::Cow<'_, [u8]> {
    use std::os::unix::ffi::OsStrExt;
    std::borrow::Cow::Borrowed(path.as_os_str().as_bytes())
}

#[cfg(not(unix))]
fn path_bytes(path: &Path) -> std::borrow::Cow<'_, [u8]> {
    match path.to_string_lossy() {
        std::borrow::Cow::Borrowed(text) => std::borrow::Cow::Borrowed(text.as_bytes()),
        std::borrow::Cow::Owned(text) => std::borrow::Cow::Owned(text.into_bytes()),
    }
}

#[cfg(unix)]
pub use transport::Unix;

#[cfg(unix)]
mod transport {
    use std::ffi::OsStr;
    use std::os::unix::ffi::OsStrExt;
    use std::path::PathBuf;

    use anyhow::{anyhow, bail, Context, Result};
    use hyper::header::{HeaderValue, HOST};
    use hyper_util::rt::TokioIo;

    use super::SCHEME;
    use crate::loopback::exchange::{exchange, prepared};
    use crate::loopback::transport::{Request, Transport};
    use crate::response::Response;

    /// HTTP/1.1 to a process on this machine listening on a Unix socket, for
    /// URLs built by [`unix_url`](super::unix_url).
    #[derive(Debug, Default)]
    pub struct Unix;

    impl Transport for Unix {
        fn name(&self) -> &'static str {
            "unix"
        }

        fn accepts(&self, url: &str) -> bool {
            url.starts_with(SCHEME)
        }

        fn send(&self, request: &Request<'_>) -> Result<Response> {
            let (socket, target) = split(request.url)?;
            let mut prepared = prepared(request, &target)?;
            prepared
                .headers_mut()
                .entry(HOST)
                .or_insert(HeaderValue::from_static("localhost"));
            exchange(request.timeout, async move {
                let stream = tokio::net::UnixStream::connect(&socket)
                    .await
                    .with_context(|| format!("connect to {}", socket.display()))?;
                let (mut sender, connection) =
                    hyper::client::conn::http1::handshake(TokioIo::new(stream))
                        .await
                        .context("open the loopback exchange")?;
                tokio::spawn(connection);
                sender
                    .send_request(prepared)
                    .await
                    .context("send the loopback request")
            })
        }
    }

    pub(super) fn split(url: &str) -> Result<(PathBuf, String)> {
        let rest = url
            .strip_prefix(SCHEME)
            .ok_or_else(|| anyhow!("not an {SCHEME} URL: {url}"))?;
        let cut = rest.find(['/', '?']).unwrap_or(rest.len());
        let (host, target) = rest.split_at(cut);
        if host.is_empty() {
            bail!("{url} names no socket");
        }
        let socket = PathBuf::from(OsStr::from_bytes(&decoded(host)?));
        let target = match target.chars().next() {
            None => "/".to_string(),
            Some('?') => format!("/{target}"),
            Some(_) => target.to_string(),
        };
        Ok((socket, target))
    }

    fn decoded(host: &str) -> Result<Vec<u8>> {
        let bytes = host.as_bytes();
        let mut out = Vec::with_capacity(bytes.len());
        let mut at = 0;
        while at < bytes.len() {
            if bytes[at] != b'%' {
                out.push(bytes[at]);
                at += 1;
                continue;
            }
            let escape = host
                .get(at + 1..at + 3)
                .and_then(|hex| u8::from_str_radix(hex, 16).ok())
                .ok_or_else(|| anyhow!("a broken escape in the socket path {host}"))?;
            out.push(escape);
            at += 3;
        }
        Ok(out)
    }
}

#[cfg(all(test, unix))]
mod tests {
    use std::path::PathBuf;

    use super::transport::split;
    use super::*;
    use crate::loopback::Transport;

    #[test]
    fn a_socket_path_survives_the_url_and_the_route_after_it() {
        let socket = Path::new("/var/lib/kroma/run/modules/tv.kroma.vpn/module.sock");
        let url = format!("{}/_port/vpn/proxy?fresh=1", unix_url(socket));

        let (back, target) = split(&url).unwrap();

        assert_eq!(back, socket);
        assert_eq!(target, "/_port/vpn/proxy?fresh=1");
    }

    #[test]
    fn the_base_url_is_one_host_with_no_slash_left_in_it() {
        let url = unix_url(Path::new("/data/run/host.sock"));

        assert_eq!(url, "http+unix://%2Fdata%2Frun%2Fhost.sock");
    }

    #[test]
    fn a_path_with_spaces_and_non_ascii_bytes_round_trips() {
        let socket = PathBuf::from("/Users/ann/Application Support/kröma/host.sock");

        let (back, target) = split(&unix_url(&socket)).unwrap();

        assert_eq!(back, socket);
        assert_eq!(target, "/");
    }

    #[test]
    fn a_bare_query_is_sent_against_the_root() {
        let url = format!("{}?k=v", unix_url(Path::new("/s")));

        assert_eq!(split(&url).unwrap().1, "/?k=v");
    }

    #[test]
    fn a_url_naming_no_socket_or_a_broken_escape_is_an_error() {
        assert!(split("http+unix:///api").is_err());
        assert!(split("http+unix://%2/api").is_err());
        assert!(split("http+unix://%zz/api").is_err());
    }

    #[test]
    fn only_its_own_scheme_is_claimed() {
        assert!(Unix.accepts("http+unix://%2Fs/x"));
        assert!(!Unix.accepts("http://127.0.0.1:9/x"));
        assert!(!Unix.accepts("unix:/s"));
    }
}
