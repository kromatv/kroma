//! The request builder and the executors that send it.

use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::de::DeserializeOwned;

use crate::config::{header_line, option_line};
use crate::curl::run;
use crate::response::Response;

/// A prepared request: builder-style options, then one of the executors
/// ([`Fetch::get`], [`Fetch::post_json`], [`Fetch::post_form`]).
#[derive(Debug, Clone)]
pub struct Fetch {
    headers: Vec<(String, String)>,
    query: Vec<(String, String)>,
    socks5: Option<String>,
    cookie_jar: Option<PathBuf>,
    max_time_secs: u32,
    http2: bool,
}

impl Default for Fetch {
    fn default() -> Self {
        Self {
            headers: Vec::new(),
            query: Vec::new(),
            socks5: None,
            cookie_jar: None,
            max_time_secs: 30,
            http2: false,
        }
    }
}

impl Fetch {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn header(mut self, name: &str, value: impl Into<String>) -> Self {
        self.headers.push((name.to_string(), value.into()));
        self
    }

    /// URL-encoded query parameter (GET only; sent via `--get --data-urlencode`).
    pub fn query(mut self, name: &str, value: impl Into<String>) -> Self {
        self.query.push((name.to_string(), value.into()));
        self
    }

    /// Route this request through a SOCKS5 proxy (`host:port` or a full
    /// `socks5://user:pass@host:port` URL). Uses `--socks5-hostname` so DNS
    /// resolves on the proxy side too (no local DNS leak).
    pub fn socks5(mut self, proxy: impl Into<String>) -> Self {
        let p = proxy.into();
        if !p.trim().is_empty() {
            self.socks5 = Some(p);
        }
        self
    }

    /// Read + write cookies at `jar` across calls (qBittorrent's SID auth).
    pub fn cookie_jar(mut self, jar: impl Into<PathBuf>) -> Self {
        self.cookie_jar = Some(jar.into());
        self
    }

    /// Require HTTP/2 for this request.
    ///
    /// Not a preference: APNs serves HTTP/2 only and refuses an HTTP/1.1
    /// request, so a caller that needs it must be able to say so. Needs a curl
    /// built with nghttp2 (`curl --version` lists `HTTP2`).
    pub fn http2(mut self) -> Self {
        self.http2 = true;
        self
    }

    /// Network budget for the whole transfer (default 30s).
    pub fn max_time(mut self, secs: u32) -> Self {
        self.max_time_secs = secs;
        self
    }

    pub fn get(&self, url: &str) -> Result<Response> {
        let mut config = self.base_config();
        if !self.query.is_empty() {
            config.push_str("get\n");
            for (k, v) in &self.query {
                config.push_str(&option_line("data-urlencode", &format!("{k}={v}")));
            }
        }
        config.push_str(&option_line("url", url));
        run(config)
    }

    pub fn post_json(&self, url: &str, body: &serde_json::Value) -> Result<Response> {
        let mut config = self.base_config();
        config.push_str(&header_line("content-type", "application/json"));
        config.push_str(&option_line("data-binary", &serde_json::to_string(body)?));
        config.push_str(&option_line("url", url));
        run(config)
    }

    /// POST a raw byte body (Web Push's `aes128gcm` ciphertext).
    ///
    /// The bytes go through a temp file, not an argv entry: an encrypted body is
    /// arbitrary binary, and a command-line argument cannot carry a NUL and
    /// would be mangled by any non-UTF-8 byte.
    pub fn post_bytes(&self, url: &str, content_type: &str, body: &[u8]) -> Result<Response> {
        use std::io::Write;

        let mut file = tempfile::Builder::new()
            .prefix("kroma-http-body-")
            .tempfile()
            .context("create the curl request body")?;
        file.write_all(body).context("write the curl request body")?;
        file.flush().context("write the curl request body")?;

        let mut config = self.base_config();
        config.push_str(&header_line("content-type", content_type));
        config.push_str(&option_line("data-binary", &format!("@{}", file.path().display())));
        config.push_str(&option_line("url", url));
        run(config)
    }

    /// `application/x-www-form-urlencoded` POST (qBittorrent login/actions).
    pub fn post_form(&self, url: &str, fields: &[(&str, &str)]) -> Result<Response> {
        let mut config = self.base_config();
        for (k, v) in fields {
            config.push_str(&option_line("data-urlencode", &format!("{k}={v}")));
        }
        config.push_str(&option_line("url", url));
        run(config)
    }

    /// GET expecting a 2xx JSON body; the common happy path in one call.
    pub fn get_json<T: DeserializeOwned>(&self, url: &str) -> Result<T> {
        self.get(url)?.ensure_ok()?.json()
    }

    fn base_config(&self) -> String {
        // location: indexer download links commonly redirect. No fail: we surface
        // the status ourselves so error bodies (and 409 handshakes) stay readable.
        let mut config = String::from("silent\nshow-error\nlocation\n");
        config.push_str(&option_line("max-time", &self.max_time_secs.to_string()));
        if self.http2 {
            config.push_str("http2\n");
        }
        if let Some(proxy) = &self.socks5 {
            // ipv4: the only SOCKS proxy (a WireGuard bridge) is IPv4-only, and a
            // dual-stack host can otherwise resolve to an AAAA the tunnel can't route.
            config.push_str("ipv4\n");
            config.push_str(&option_line("socks5-hostname", proxy));
        }
        if let Some(jar) = &self.cookie_jar {
            let jar = jar.to_string_lossy();
            config.push_str(&option_line("cookie-jar", &jar));
            config.push_str(&option_line("cookie", &jar));
        }
        for (k, v) in &self.headers {
            config.push_str(&header_line(k, v));
        }
        config
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_socks5_is_ignored() {
        let f = Fetch::new().socks5("  ");
        assert!(f.socks5.is_none());
    }

    #[test]
    fn socks5_forces_ipv4() {
        let config = Fetch::new().socks5("socks5://127.0.0.1:25345").base_config();
        assert!(config.contains("\nipv4\n"), "{config}");
        assert!(config.contains(r#"socks5-hostname = "socks5://127.0.0.1:25345""#), "{config}");
        assert!(!Fetch::new().base_config().contains("ipv4"), "{config}");
    }

    #[test]
    fn base_config_carries_headers_cookie_jar_and_max_time() {
        let config =
            Fetch::new().header("X-Test", "v").max_time(99).cookie_jar("/tmp/jar").base_config();
        assert!(config.contains(r#"header = "X-Test: v""#), "{config}");
        assert!(config.contains(r#"max-time = "99""#), "{config}");
        assert!(config.contains(r#"cookie-jar = "/tmp/jar""#), "{config}");
        assert!(config.contains(r#"cookie = "/tmp/jar""#), "{config}");
    }

    #[test]
    fn http2_is_requested_only_when_asked_for() {
        assert!(Fetch::new().http2().base_config().contains("\nhttp2\n"));
        assert!(!Fetch::new().base_config().contains("http2"));
    }

    #[test]
    fn a_header_value_cannot_inject_a_second_curl_option() {
        let smuggled = "k\"\r\noutput = \"/tmp/pwned\"\nheader = \"X-Injected: 1\\";
        let config = Fetch::new().header("X-Api-Key", smuggled).base_config();

        let options: Vec<&str> = config.lines().collect();
        assert_eq!(options.len(), 5, "one line per option: {config}");
        assert!(options[4].starts_with(r#"header = "X-Api-Key: k\""#), "{config}");
        assert!(options[4].ends_with(r#"X-Injected: 1\\""#), "{config}");
    }

    #[test]
    fn builder_setters_record_options() {
        let f = Fetch::new().query("q", "hello world").header("A", "b").max_time(5);
        assert_eq!(f.query, vec![("q".to_string(), "hello world".to_string())]);
        assert_eq!(f.headers, vec![("A".to_string(), "b".to_string())]);
        assert_eq!(f.max_time_secs, 5);
        assert_eq!(Fetch::new().max_time_secs, 30);
        assert!(!Fetch::new().http2);
        assert!(Fetch::new().http2().http2);
    }
}
