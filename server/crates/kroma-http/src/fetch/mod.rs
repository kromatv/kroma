//! The request builder and the executors that send it.

use std::path::PathBuf;

#[cfg(target_family = "wasm")]
pub mod guest;
#[cfg(not(target_family = "wasm"))]
mod native;
#[cfg(not(target_family = "wasm"))]
mod render;
#[cfg(not(target_family = "wasm"))]
mod send;

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
    /// `socks5://user:pass@host:port`). Any scheme is dropped so the proxy always
    /// resolves the name: curl reads `socks5://` as "resolve locally" even under
    /// `--socks5-hostname`. A proxy the gate names replaces this one.
    pub fn socks5(mut self, proxy: impl Into<String>) -> Self {
        self.socks5 = bare_proxy(&proxy.into());
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

    /// Refuse the request unless its host resolves only to public internet
    /// addresses, and pin curl to the one that was checked. Implies
    /// [`Fetch::no_redirects`]. For a URL any account can choose.
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

}

pub(crate) fn bare_proxy(proxy: &str) -> Option<String> {
    let proxy = proxy.trim();
    let bare = proxy.split_once("://").map_or(proxy, |(_, rest)| rest);
    (!bare.is_empty()).then(|| bare.to_string())
}

#[cfg(test)]
mod tests;
