//! The request builder and the executors that send it.

use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::de::DeserializeOwned;

use crate::config::{header_line, option_line};
use crate::curl::run;
use crate::multipart::{part_line, FormPart};
use crate::pin::public_resolve_line;
use crate::response::Response;

/// A prepared request: builder-style options, then one of the executors
/// ([`Fetch::get`], [`Fetch::post_json`], [`Fetch::post_form`]).
#[derive(Debug, Clone)]
pub struct Fetch {
    headers: Vec<(String, String)>,
    query: Vec<(String, String)>,
    socks5: Option<String>,
    cookie_jar: Option<PathBuf>,
    digest: Option<(String, String)>,
    max_time_secs: u32,
    max_bytes: Option<u64>,
    http2: bool,
    follow_redirects: bool,
    public_only: bool,
}

impl Default for Fetch {
    fn default() -> Self {
        Self {
            headers: Vec::new(),
            query: Vec::new(),
            socks5: None,
            cookie_jar: None,
            digest: None,
            max_time_secs: 30,
            max_bytes: None,
            http2: false,
            follow_redirects: true,
            public_only: false,
        }
    }
}

crate::builder::request_builder!(
    Fetch,
    query = "URL-encoded query parameter (GET only; sent via `--get --data-urlencode`)."
);

impl Fetch {
    /// Route this request through a SOCKS5 proxy (`host:port`, or a URL such as
    /// `socks5://user:pass@host:port`). The proxy always resolves the name: any
    /// scheme is dropped, because curl reads `socks5://` as "resolve locally"
    /// even under `--socks5-hostname`, which would leak every hostname to the
    /// local resolver.
    pub fn socks5(mut self, proxy: impl Into<String>) -> Self {
        let proxy = proxy.into();
        let bare = proxy
            .trim()
            .split_once("://")
            .map_or(proxy.trim(), |(_, rest)| rest);
        if !bare.is_empty() {
            self.socks5 = Some(bare.to_string());
        }
        self
    }

    /// Answer a redirect with the redirect itself instead of following it, for a
    /// URL that came from someone the server should not let steer it elsewhere.
    pub fn no_redirects(mut self) -> Self {
        self.follow_redirects = false;
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
        self.send(url, config)
    }

    pub fn post_json(&self, url: &str, body: &serde_json::Value) -> Result<Response> {
        let mut config = self.base_config();
        config.push_str(&header_line("content-type", "application/json"));
        config.push_str(&option_line("data-binary", &serde_json::to_string(body)?));
        config.push_str(&option_line("url", url));
        self.send(url, config)
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
        self.send(url, config)
    }

    /// `application/x-www-form-urlencoded` POST (qBittorrent login/actions).
    /// With no fields it is a POST with an empty body rather than a GET, which
    /// is what Roku's ECP wants: the arguments in the query string, nothing else.
    pub fn post_form(&self, url: &str, fields: &[(&str, &str)]) -> Result<Response> {
        self.send(url, self.form_config(url, fields))
    }

    /// `multipart/form-data` POST (Roku's developer installer takes the channel
    /// zip this way).
    pub fn post_multipart(&self, url: &str, parts: &[(&str, FormPart<'_>)]) -> Result<Response> {
        self.send(url, self.multipart_config(url, parts))
    }

    /// GET expecting a 2xx JSON body; the common happy path in one call.
    pub fn get_json<T: DeserializeOwned>(&self, url: &str) -> Result<T> {
        self.get(url)?.ensure_ok()?.json()
    }

    fn form_config(&self, url: &str, fields: &[(&str, &str)]) -> String {
        let mut config = self.base_config();
        // Only with no fields: a data line is what makes curl POST, and naming
        // the method outright would also make it re-POST to a redirect instead
        // of following with GET, which an indexer's HTML login form expects.
        if fields.is_empty() {
            config.push_str(&option_line("request", "POST"));
            config.push_str(&option_line("data", ""));
        }
        for (k, v) in fields {
            config.push_str(&option_line("data-urlencode", &format!("{k}={v}")));
        }
        config.push_str(&option_line("url", url));
        config
    }

    fn multipart_config(&self, url: &str, parts: &[(&str, FormPart<'_>)]) -> String {
        let mut config = self.base_config();
        for (name, part) in parts {
            config.push_str(&part_line(name, *part));
        }
        config.push_str(&option_line("url", url));
        config
    }

    fn send(&self, url: &str, mut config: String) -> Result<Response> {
        if self.public_only {
            config.push_str(&public_resolve_line(url)?);
        }
        run(config)
    }

    fn base_config(&self) -> String {
        // location: indexer download links commonly redirect. No fail: we surface
        // the status ourselves so error bodies (and 409 handshakes) stay readable.
        // proto: a URL from an indexer or a catalog must not reach `file://`.
        let mut config = String::from("silent\nshow-error\n");
        config.push_str(&option_line("proto", "=http,https"));
        config.push_str(&option_line("proto-redir", "=http,https"));
        if self.follow_redirects {
            config.push_str("location\n");
        }
        config.push_str(&option_line("max-time", &self.max_time_secs.to_string()));
        if let Some(bytes) = self.max_bytes {
            config.push_str(&option_line("max-filesize", &bytes.to_string()));
        }
        if self.http2 {
            config.push_str("http2\n");
        }
        if let Some(proxy) = &self.socks5 {
            // ipv4: the only SOCKS proxy (a WireGuard bridge) is IPv4-only, and a
            // dual-stack host can otherwise resolve to an AAAA the tunnel can't route.
            config.push_str("ipv4\n");
            config.push_str(&option_line("socks5-hostname", proxy));
        }
        if let Some((user, password)) = &self.digest {
            config.push_str("digest\n");
            config.push_str(&option_line("user", &format!("{user}:{password}")));
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
    use std::path::Path;

    use super::*;

    #[test]
    fn empty_socks5_is_ignored() {
        let f = Fetch::new().socks5("  ");
        assert!(f.socks5.is_none());
    }

    #[test]
    fn socks5_forces_ipv4() {
        let config = Fetch::new().socks5("127.0.0.1:25345").base_config();
        assert!(config.contains("\nipv4\n"), "{config}");
        assert!(!Fetch::new().base_config().contains("ipv4"), "{config}");
    }

    #[test]
    fn the_proxy_resolves_names_whatever_scheme_the_caller_wrote() {
        for proxy in [
            "socks5://127.0.0.1:25345",
            "socks5h://127.0.0.1:25345",
            "127.0.0.1:25345",
        ] {
            let config = Fetch::new().socks5(proxy).base_config();

            assert!(
                config.contains("socks5-hostname = \"127.0.0.1:25345\"\n"),
                "{proxy}: {config}"
            );
        }
        let with_credentials = Fetch::new()
            .socks5("socks5://kroma:secret@127.0.0.1:1080")
            .base_config();
        assert!(
            with_credentials.contains("socks5-hostname = \"kroma:secret@127.0.0.1:1080\"\n"),
            "{with_credentials}"
        );
    }

    #[test]
    fn redirects_are_followed_unless_refused() {
        assert!(Fetch::new().base_config().contains("\nlocation\n"));
        assert!(!Fetch::new()
            .no_redirects()
            .base_config()
            .contains("location"));
        assert!(!Fetch::new()
            .public_only()
            .base_config()
            .contains("location"));
    }

    #[test]
    fn only_web_protocols_are_reachable_even_through_a_redirect() {
        let config = Fetch::new().base_config();

        assert!(config.contains("proto = \"=http,https\"\n"), "{config}");
        assert!(
            config.contains("proto-redir = \"=http,https\"\n"),
            "{config}"
        );
    }

    #[test]
    fn a_public_only_request_to_a_private_address_never_reaches_curl() {
        let err = Fetch::new()
            .public_only()
            .post_bytes(
                "http://127.0.0.1:4040/api/_host/settings",
                "text/plain",
                b"x",
            )
            .unwrap_err()
            .to_string();

        assert!(err.contains("not a public internet address"), "{err}");
    }

    #[test]
    fn base_config_carries_headers_cookie_jar_and_max_time() {
        let config = Fetch::new()
            .header("X-Test", "v")
            .max_time(99)
            .cookie_jar("/tmp/jar")
            .base_config();
        assert!(config.contains(r#"header = "X-Test: v""#), "{config}");
        assert!(config.contains(r#"max-time = "99""#), "{config}");
        assert!(config.contains(r#"cookie-jar = "/tmp/jar""#), "{config}");
        assert!(config.contains(r#"cookie = "/tmp/jar""#), "{config}");
    }

    #[test]
    fn a_body_cap_reaches_curl_only_when_asked_for() {
        assert!(Fetch::new()
            .max_bytes(1024)
            .base_config()
            .contains(r#"max-filesize = "1024""#));
        assert!(!Fetch::new().base_config().contains("max-filesize"));
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
        assert_eq!(options.len(), 7, "one line per option: {config}");
        assert!(
            options[6].starts_with(r#"header = "X-Api-Key: k\""#),
            "{config}"
        );
        assert!(options[6].ends_with(r#"X-Injected: 1\\""#), "{config}");
    }

    #[test]
    fn only_a_form_post_with_no_fields_names_the_method_itself() {
        let empty = Fetch::new().form_config("http://box:8060/launch/dev?server=x", &[]);
        assert!(empty.contains("request = \"POST\"\n"), "{empty}");
        assert!(empty.contains("data = \"\"\n"), "{empty}");

        let filled = Fetch::new().form_config("http://box/api", &[("user", "ana")]);
        assert!(!filled.contains("request = "), "{filled}");
        assert!(!filled.contains("data = \"\"\n"), "{filled}");
        assert!(
            filled.contains("data-urlencode = \"user=ana\"\n"),
            "{filled}"
        );
    }

    #[test]
    fn a_multipart_post_carries_one_line_per_part_and_the_url_last() {
        let config = Fetch::new().multipart_config(
            "http://box/plugin_install",
            &[
                ("mysubmit", FormPart::Text("Replace")),
                ("archive", FormPart::File(Path::new("/data/channel.zip"))),
            ],
        );

        let options: Vec<&str> = config.lines().collect();
        assert_eq!(
            options[6], r#"form-string = "mysubmit=Replace""#,
            "{config}"
        );
        assert_eq!(
            options[7], r#"form = "archive=@\"/data/channel.zip\"""#,
            "{config}"
        );
        assert_eq!(
            options[8], r#"url = "http://box/plugin_install""#,
            "{config}"
        );
    }

    #[test]
    fn a_digest_password_cannot_smuggle_a_second_curl_option() {
        let smuggled = "pa\"ss\nurl = \"http://evil\"";
        let config = Fetch::new().digest("rokudev", smuggled).base_config();

        let options: Vec<&str> = config.lines().collect();
        assert_eq!(options.len(), 8, "one line per option: {config}");
        assert_eq!(options[6], "digest", "{config}");
        assert!(
            options[7].starts_with(r#"user = "rokudev:pa\"ss\nurl"#),
            "{config}"
        );
        assert!(!Fetch::new().base_config().contains("digest"));
    }

    #[test]
    fn builder_setters_record_options() {
        let f = Fetch::new()
            .query("q", "hello world")
            .header("A", "b")
            .max_time(5);
        assert_eq!(f.query, vec![("q".to_string(), "hello world".to_string())]);
        assert_eq!(f.headers, vec![("A".to_string(), "b".to_string())]);
        assert_eq!(f.max_time_secs, 5);
        assert_eq!(Fetch::new().max_time_secs, 30);
        assert!(!Fetch::new().http2);
        assert!(Fetch::new().http2().http2);
    }
}
