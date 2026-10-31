//! The request builder and the executors that send it.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::de::DeserializeOwned;

use crate::config::{header_line, option_line};
use crate::multipart::FormPart;
use crate::response::Response;

mod render;
mod send;

use send::Call;

/// A prepared request: builder-style options, then one of the executors
/// ([`Fetch::get`], [`Fetch::post_json`], [`Fetch::post_form`]). Every executor
/// passes through the process's [`crate::egress`] gate and sink.
#[derive(Debug, Clone)]
pub struct Fetch {
    purpose: &'static str,
    headers: Vec<(String, String)>,
    query: Vec<(String, String)>,
    socks5: Option<String>,
    cookie_jar: Option<PathBuf>,
    digest: Option<(String, String)>,
    max_time_secs: u32,
    max_bytes: Option<u64>,
    max_redirects: Option<u8>,
    http2: bool,
    follow_redirects: bool,
    public_only: bool,
    https_only: bool,
}

impl Default for Fetch {
    fn default() -> Self {
        Self {
            purpose: "unlabelled",
            headers: Vec::new(),
            query: Vec::new(),
            socks5: None,
            cookie_jar: None,
            digest: None,
            max_time_secs: 30,
            max_bytes: None,
            max_redirects: None,
            http2: false,
            follow_redirects: true,
            public_only: false,
            https_only: false,
        }
    }
}

crate::builder::request_builder!(
    Fetch,
    query = "URL-encoded query parameter (GET only; sent via `--get --data-urlencode`)."
);

impl Fetch {
    /// Why this call leaves the process, as the gate and the journal name it
    /// (default `"unlabelled"`).
    pub fn purpose(mut self, purpose: &'static str) -> Self {
        self.purpose = purpose;
        self
    }

    /// Route this request through a SOCKS5 proxy (`host:port`, or a URL such as
    /// `socks5://user:pass@host:port`). The proxy always resolves the name: any
    /// scheme is dropped, because curl reads `socks5://` as "resolve locally"
    /// even under `--socks5-hostname`, which would leak every hostname to the
    /// local resolver. A proxy the gate names replaces this one.
    pub fn socks5(mut self, proxy: impl Into<String>) -> Self {
        self.socks5 = render::bare_proxy(&proxy.into());
        self
    }

    /// Answer a redirect with the redirect itself instead of following it, for a
    /// URL that came from someone the server should not let steer it elsewhere.
    pub fn no_redirects(mut self) -> Self {
        self.follow_redirects = false;
        self
    }

    pub fn max_redirects(mut self, hops: u8) -> Self {
        self.max_redirects = Some(hops);
        self
    }

    /// Refuse the request unless its host is, and resolves only to, public
    /// internet addresses, and pin curl to the address that was checked. Implies
    /// [`Fetch::no_redirects`], since each hop would need checking again. For a
    /// URL any account can choose, such as a Web Push endpoint.
    pub fn public_only(mut self) -> Self {
        self.public_only = true;
        self.follow_redirects = false;
        self
    }

    /// Refuse plain HTTP, on the first request and on every redirect.
    pub fn https_only(mut self) -> Self {
        self.https_only = true;
        self
    }

    /// Refuse a response body larger than `bytes`, so a third-party answer is
    /// bounded before anything parses it.
    pub fn max_bytes(mut self, bytes: u64) -> Self {
        self.max_bytes = Some(bytes);
        self
    }

    /// Read + write cookies at `jar` across calls (qBittorrent's SID auth).
    pub fn cookie_jar(mut self, jar: impl Into<PathBuf>) -> Self {
        self.cookie_jar = Some(jar.into());
        self
    }

    /// Answer an HTTP digest challenge as `user` (Roku's developer installer
    /// serves one). The credentials travel in the config on curl's stdin, so
    /// they never reach argv.
    pub fn digest(mut self, user: &str, password: impl Into<String>) -> Self {
        self.digest = Some((user.to_string(), password.into()));
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

    pub fn get(&self, url: &str) -> Result<Response> {
        let mut config = self.base_config();
        if !self.query.is_empty() {
            config.push_str("get\n");
            for (k, v) in &self.query {
                config.push_str(&option_line("data-urlencode", &format!("{k}={v}")));
            }
        }
        config.push_str(&option_line("url", url));
        self.send(Call::get(), url, config)
    }

    /// GET `url` into the file at `dest` rather than into memory, for a body
    /// too large to hold. The response carries the status and headers and an
    /// empty body; `dest` holds whatever was sent, an error page included, so
    /// check the status before keeping it.
    pub fn download(&self, url: &str, dest: &Path) -> Result<Response> {
        let mut config = self.base_config();
        config.push_str(&option_line("output", &dest.to_string_lossy()));
        config.push_str(&option_line("url", url));
        self.send(Call::download(dest), url, config)
    }

    pub fn post_json(&self, url: &str, body: &serde_json::Value) -> Result<Response> {
        let body = serde_json::to_string(body)?;
        let mut config = self.base_config();
        config.push_str(&header_line("content-type", "application/json"));
        config.push_str(&option_line("data-binary", &body));
        config.push_str(&option_line("url", url));
        self.send(Call::post(body.len() as u64), url, config)
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
        file.write_all(body)
            .context("write the curl request body")?;
        file.flush().context("write the curl request body")?;

        let mut config = self.base_config();
        config.push_str(&header_line("content-type", content_type));
        config.push_str(&option_line(
            "data-binary",
            &format!("@{}", file.path().display()),
        ));
        config.push_str(&option_line("url", url));
        self.send(Call::post(body.len() as u64), url, config)
    }

    /// `application/x-www-form-urlencoded` POST (qBittorrent login/actions).
    /// With no fields it is a POST with an empty body rather than a GET, which
    /// is what Roku's ECP wants: the arguments in the query string, nothing else.
    pub fn post_form(&self, url: &str, fields: &[(&str, &str)]) -> Result<Response> {
        let sent = fields
            .iter()
            .map(|(k, v)| (k.len() + v.len() + 1) as u64)
            .sum();
        self.send(Call::post(sent), url, self.form_config(url, fields))
    }

    /// `multipart/form-data` POST (Roku's developer installer takes the channel
    /// zip this way).
    pub fn post_multipart(&self, url: &str, parts: &[(&str, FormPart<'_>)]) -> Result<Response> {
        let sent = parts.iter().map(|(_, part)| part.size()).sum();
        self.send(Call::post(sent), url, self.multipart_config(url, parts))
    }

    /// GET expecting a 2xx JSON body; the common happy path in one call.
    pub fn get_json<T: DeserializeOwned>(&self, url: &str) -> Result<T> {
        self.get(url)?.ensure_ok()?.json()
    }
}

#[cfg(test)]
mod tests;
