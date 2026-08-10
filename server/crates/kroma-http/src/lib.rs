//! HTTP transport over the system `curl` binary, shared by the acquisition
//! stack (Torznab indexers, Transmission/qBittorrent RPC, VPN checks).
//!
//! Deliberately not streaming: every payload here fits in memory. Response
//! headers are captured via `-D <tmpfile>` because some protocols carry state
//! there (Transmission's `X-Transmission-Session-Id` rides a 409 response),
//! which is also why requests never pass `-f`: callers read
//! [`Response::status`] instead of losing the body on HTTP errors.

use std::path::PathBuf;
use std::process::Command;

use anyhow::{bail, Context, Result};
use serde::de::DeserializeOwned;

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

    /// URL-encoded query parameter (GET only; sent via `-G --data-urlencode`).
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
        let mut cmd = self.base_cmd();
        if !self.query.is_empty() {
            cmd.arg("-G");
            for (k, v) in &self.query {
                cmd.arg("--data-urlencode").arg(format!("{k}={v}"));
            }
        }
        cmd.arg(url);
        run(cmd)
    }

    pub fn post_json(&self, url: &str, body: &serde_json::Value) -> Result<Response> {
        let mut cmd = self.base_cmd();
        cmd.arg("-H").arg("content-type: application/json");
        cmd.arg("--data-binary").arg(serde_json::to_string(body)?);
        cmd.arg(url);
        run(cmd)
    }

    /// POST a raw byte body (Web Push's `aes128gcm` ciphertext).
    ///
    /// The bytes go over the child's **stdin** (`--data-binary @-`), not an
    /// argv entry: an encrypted body is arbitrary binary, and a command-line
    /// argument cannot carry a NUL and would be mangled by any non-UTF-8 byte.
    pub fn post_bytes(&self, url: &str, content_type: &str, body: &[u8]) -> Result<Response> {
        let mut cmd = self.base_cmd();
        cmd.arg("-H").arg(format!("content-type: {content_type}"));
        cmd.arg("--data-binary").arg("@-");
        cmd.arg(url);
        run_with_stdin(cmd, Some(body))
    }

    /// `application/x-www-form-urlencoded` POST (qBittorrent login/actions).
    pub fn post_form(&self, url: &str, fields: &[(&str, &str)]) -> Result<Response> {
        let mut cmd = self.base_cmd();
        for (k, v) in fields {
            cmd.arg("--data-urlencode").arg(format!("{k}={v}"));
        }
        cmd.arg(url);
        run(cmd)
    }

    /// GET expecting a 2xx JSON body; the common happy path in one call.
    pub fn get_json<T: DeserializeOwned>(&self, url: &str) -> Result<T> {
        self.get(url)?.ensure_ok()?.json()
    }

    fn base_cmd(&self) -> Command {
        let mut cmd = Command::new("curl");
        // -L: indexer download links commonly redirect. No -f: we surface the
        // status ourselves so error bodies (and 409 handshakes) stay readable.
        cmd.args(["-s", "-S", "-L", "--max-time", &self.max_time_secs.to_string()]);
        if self.http2 {
            cmd.arg("--http2");
        }
        if let Some(proxy) = &self.socks5 {
            // -4: the only SOCKS proxy (a WireGuard bridge) is IPv4-only, and a
            // dual-stack host can otherwise resolve to an AAAA the tunnel can't route.
            cmd.arg("-4").arg("--socks5-hostname").arg(proxy);
        }
        if let Some(jar) = &self.cookie_jar {
            cmd.arg("-c").arg(jar).arg("-b").arg(jar);
        }
        for (k, v) in &self.headers {
            cmd.arg("-H").arg(format!("{k}: {v}"));
        }
        cmd
    }
}

/// One HTTP exchange: final status + final header block + body bytes.
#[derive(Debug)]
pub struct Response {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl Response {
    /// First header with this name, case-insensitively.
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str())
    }

    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }

    pub fn json<T: DeserializeOwned>(&self) -> Result<T> {
        serde_json::from_slice(&self.body)
            .with_context(|| format!("parse JSON response: {}", snippet(&self.body)))
    }

    /// Error out (with a body snippet) unless the status is 2xx.
    pub fn ensure_ok(self) -> Result<Self> {
        if !(200..300).contains(&self.status) {
            bail!("HTTP {}: {}", self.status, snippet(&self.body));
        }
        Ok(self)
    }
}

fn snippet(body: &[u8]) -> String {
    let text = String::from_utf8_lossy(body);
    let trimmed = text.trim();
    let mut s: String = trimmed.chars().take(200).collect();
    if trimmed.chars().count() > 200 {
        s.push_str("...");
    }
    s
}

fn run(cmd: Command) -> Result<Response> {
    run_with_stdin(cmd, None)
}

// Writing the body on this thread is safe because curl drains stdin before
// producing a response, so it never deadlocks on a full stdout pipe.
fn run_with_stdin(mut cmd: Command, stdin_body: Option<&[u8]>) -> Result<Response> {
    use std::io::Write;

    // A guard, not a path: every `?` below returns before the read, and a dump
    // left behind on a failed spawn is one file per attempt forever.
    let hdr = tempfile::Builder::new()
        .prefix("kroma-http-hdr-")
        .tempfile()
        .context("create the curl header dump")?;
    let hdr_path = hdr.path().to_path_buf();
    cmd.arg("-D").arg(&hdr_path);
    let out = match stdin_body {
        None => cmd.output().context("spawn curl")?,
        Some(body) => {
            cmd.stdin(std::process::Stdio::piped());
            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());
            let mut child = cmd.spawn().context("spawn curl")?;
            child
                .stdin
                .take()
                .context("curl stdin was not piped")?
                .write_all(body)
                .context("write request body to curl")?;
            // `stdin` dropped here, closing the pipe so curl sees EOF.
            child.wait_with_output().context("wait for curl")?
        }
    };
    let raw_headers = std::fs::read_to_string(&hdr_path).unwrap_or_default();
    if !out.status.success() {
        bail!(
            "curl exit {}: {}",
            out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    let (status, headers) = parse_last_block(&raw_headers)?;
    Ok(Response { status, headers, body: out.stdout })
}

// With `-L`, curl appends one header block per hop to the dump; only the
// final block describes the response whose body we hold.
fn parse_last_block(raw: &str) -> Result<(u16, Vec<(String, String)>)> {
    let mut status = None;
    let mut headers = Vec::new();
    for line in raw.lines() {
        let line = line.trim_end_matches('\r');
        if let Some(rest) = line.strip_prefix("HTTP/") {
            // New block: "HTTP/1.1 200 OK" or "HTTP/2 302". Reset accumulation.
            status = rest.split_whitespace().nth(1).and_then(|c| c.parse::<u16>().ok());
            headers.clear();
        } else if let Some((k, v)) = line.split_once(':') {
            headers.push((k.trim().to_string(), v.trim().to_string()));
        }
    }
    let status = status.ok_or_else(|| anyhow::anyhow!("no HTTP status line in curl header dump"))?;
    Ok((status, headers))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_single_block() {
        let raw = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nX-Thing: a\r\n\r\n";
        let (status, headers) = parse_last_block(raw).unwrap();
        assert_eq!(status, 200);
        assert_eq!(headers.len(), 2);
        assert_eq!(headers[0], ("Content-Type".to_string(), "application/json".to_string()));
    }

    #[test]
    fn keeps_only_the_final_redirect_block() {
        let raw = concat!(
            "HTTP/1.1 302 Found\r\nLocation: https://elsewhere\r\n\r\n",
            "HTTP/2 200\r\ncontent-type: text/xml\r\n\r\n",
        );
        let (status, headers) = parse_last_block(raw).unwrap();
        assert_eq!(status, 200);
        assert_eq!(headers, vec![("content-type".to_string(), "text/xml".to_string())]);
    }

    #[test]
    fn header_lookup_is_case_insensitive() {
        let resp = Response {
            status: 409,
            headers: vec![("X-Transmission-Session-Id".to_string(), "abc123".to_string())],
            body: Vec::new(),
        };
        assert_eq!(resp.header("x-transmission-session-id"), Some("abc123"));
        assert_eq!(resp.header("missing"), None);
    }

    #[test]
    fn ensure_ok_rejects_non_2xx_with_snippet() {
        let resp = Response { status: 500, headers: Vec::new(), body: b"boom".to_vec() };
        let err = resp.ensure_ok().unwrap_err().to_string();
        assert!(err.contains("500"), "{err}");
        assert!(err.contains("boom"), "{err}");
    }

    #[test]
    fn empty_socks5_is_ignored() {
        let f = Fetch::new().socks5("  ");
        assert!(f.socks5.is_none());
    }

    #[test]
    fn socks5_forces_ipv4() {
        let args: Vec<String> = Fetch::new()
            .socks5("socks5://127.0.0.1:25345")
            .base_cmd()
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert!(args.contains(&"-4".to_string()), "{args:?}");
        assert!(args.contains(&"--socks5-hostname".to_string()), "{args:?}");
        let plain: Vec<String> = Fetch::new()
            .base_cmd()
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert!(!plain.contains(&"-4".to_string()), "{plain:?}");
    }

    #[test]
    fn snippet_trims_and_truncates_long_bodies() {
        assert_eq!(snippet(b"  hi there  "), "hi there");
        let long = "a".repeat(500);
        let s = snippet(long.as_bytes());
        assert_eq!(s.chars().count(), 203, "200 kept chars + the ... suffix");
        assert!(s.ends_with("..."));
        let exact = "b".repeat(200);
        let s = snippet(exact.as_bytes());
        assert_eq!(s.chars().count(), 200);
        assert!(!s.ends_with("..."));
    }

    #[test]
    fn parse_last_block_errors_without_a_status_line() {
        let err = parse_last_block("Content-Type: text/plain\r\n\r\n").unwrap_err();
        assert!(err.to_string().contains("no HTTP status line"), "{err}");
    }

    #[test]
    fn response_text_and_json_round_trip_and_error() {
        let resp = Response { status: 200, headers: Vec::new(), body: br#"{"a":1}"#.to_vec() };
        assert_eq!(resp.text(), r#"{"a":1}"#);
        let v: serde_json::Value = resp.json().unwrap();
        assert_eq!(v["a"], 1);

        let bad = Response { status: 200, headers: Vec::new(), body: b"not json at all".to_vec() };
        let err = bad.json::<serde_json::Value>().unwrap_err().to_string();
        assert!(err.contains("parse JSON"), "{err}");
        assert!(err.contains("not json"), "{err}");
    }

    #[test]
    fn ensure_ok_accepts_2xx() {
        let resp = Response { status: 204, headers: Vec::new(), body: Vec::new() };
        assert!(resp.ensure_ok().is_ok());
        let redirect = Response { status: 300, headers: Vec::new(), body: b"moved".to_vec() };
        assert!(redirect.ensure_ok().is_err());
    }

    #[test]
    fn base_cmd_includes_headers_cookie_jar_and_max_time() {
        let args: Vec<String> = Fetch::new()
            .header("X-Test", "v")
            .max_time(99)
            .cookie_jar("/tmp/jar")
            .base_cmd()
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert!(args.contains(&"X-Test: v".to_string()), "{args:?}");
        assert!(args.contains(&"99".to_string()), "max-time value present: {args:?}");
        assert!(args.contains(&"-c".to_string()) && args.contains(&"-b".to_string()), "{args:?}");
        assert!(args.contains(&"/tmp/jar".to_string()), "{args:?}");
    }

    #[test]
    fn http2_is_requested_only_when_asked_for() {
        let args = |f: Fetch| -> Vec<String> {
            f.base_cmd().get_args().map(|a| a.to_string_lossy().into_owned()).collect()
        };
        assert!(args(Fetch::new().http2()).contains(&"--http2".to_string()));
        assert!(!args(Fetch::new()).contains(&"--http2".to_string()));
    }

    #[test]
    fn post_bytes_sends_the_body_over_stdin_not_argv() {
        let args: Vec<String> = {
            let mut cmd = Fetch::new().base_cmd();
            cmd.arg("--data-binary").arg("@-");
            cmd.get_args().map(|a| a.to_string_lossy().into_owned()).collect()
        };
        assert!(args.contains(&"@-".to_string()), "{args:?}");
    }

    // Uses `file://` so the test needs no network.
    #[test]
    fn post_bytes_round_trips_arbitrary_binary() {
        let body: Vec<u8> = (0u8..=255).collect();
        let dir = kroma_testing::temp_dir("http-bin");
        let target = dir.path().join("uploaded.bin");

        let out = Command::new("curl")
            .args(["-s", "-S", "--upload-file", "-"])
            .arg(format!("file://{}", target.display()))
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .spawn()
            .and_then(|mut child| {
                use std::io::Write;
                child.stdin.take().unwrap().write_all(&body)?;
                child.wait_with_output()
            });
        let Ok(out) = out else {
            return; // no curl on this machine: nothing to assert
        };
        assert!(out.status.success());
        let written = std::fs::read(&target).expect("curl wrote the body");
        assert_eq!(written, body, "every byte value must survive the stdin pipe");
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
