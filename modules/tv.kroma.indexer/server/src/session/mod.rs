//! The network layer: a per-indexer [`Session`] that fetches over `curl`
//! (via `kroma-http`), keeping a cookie jar, driving the login flow, and
//! optionally routing through a SOCKS5 proxy or a FlareSolverr instance.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use anyhow::{bail, Context as _, Result};

use crate::context::Context;
use crate::definition::Definition;
use crate::{engine, template, IndexerConfig, Release};

mod download;
mod login;
mod response;
mod search;

// A desktop-browser User-Agent: many trackers 403 the default curl UA.
const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const MAX_TIME_SECS: u32 = 45;

// How long a tracker that answered 429 is left alone for.
const RATE_LIMIT_COOLDOWN: Duration = Duration::from_secs(60);

/// A live connection to one configured indexer.
pub struct Session {
    def: Definition,
    cfg: IndexerConfig,
    cookie_jar: PathBuf,
    socks5: Option<String>,
    flaresolverr: Option<String>,
    state: Mutex<SessionState>,
}

#[derive(Default)]
struct SessionState {
    next_allowed: Option<Instant>,
    cookie_header: Option<String>,
    logged_in: bool,
}

/// Releases plus per-path error notes, so an empty result reads apart from a
/// broken indexer.
#[derive(Debug, Default)]
pub struct SearchOutcome {
    pub releases: Vec<Release>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DownloadTarget {
    Magnet(String),
    TorrentUrl(String),
}

impl Session {
    pub fn new(
        data_dir: &Path,
        indexer_id: &str,
        def: Definition,
        cfg: IndexerConfig,
        socks5: Option<String>,
        flaresolverr: Option<String>,
    ) -> Self {
        let cookie_jar = cookie_jar_path(data_dir, indexer_id);
        Session {
            def,
            cfg,
            cookie_jar,
            socks5,
            flaresolverr,
            state: Mutex::new(SessionState::default()),
        }
    }

    fn ctx(&self) -> Context {
        Context::with_config(&self.def, &self.cfg)
    }

    // Base and path may both carry `{{ .Config.apiurl }}`, so each must be
    // rendered before joining, or an unrendered path reaches curl verbatim.
    fn render(&self, s: &str) -> String {
        template::render(s, &self.ctx())
    }

    fn rendered_base(&self) -> String {
        self.render(&self.cfg.base_url)
    }

    fn url_for(&self, path: &str) -> String {
        engine::join_url(&self.rendered_base(), &self.render(path))
    }

    fn base_fetch(&self) -> kroma_module_sdk::http::Fetch {
        let mut f = kroma_module_sdk::http::Fetch::new()
            .max_time(MAX_TIME_SECS)
            .cookie_jar(&self.cookie_jar)
            .header("User-Agent", USER_AGENT);
        if let Some(proxy) = &self.socks5 {
            f = f.socks5(proxy.clone());
        }
        if let Some(cookie) = self.state.lock().unwrap().cookie_header.clone() {
            f = f.header("Cookie", cookie);
        }
        f
    }

    fn throttle(&self) {
        let delay = match self.def.request_delay {
            Some(d) if d > 0.0 => Duration::from_secs_f64(d),
            _ => return,
        };
        // Reserve this caller's slot under the lock, then sleep without holding
        // it, so concurrent callers stay spaced without blocking each other.
        let now = Instant::now();
        let start_at = {
            let mut st = self.state.lock().unwrap();
            let base = st.next_allowed.map(|na| na.max(now)).unwrap_or(now);
            st.next_allowed = Some(base + delay);
            base
        };
        if start_at > now {
            std::thread::sleep(start_at - now);
        }
    }

    fn get_text(&self, url: &str, query: &[(String, String)]) -> Result<String> {
        if self.flaresolverr.is_some() {
            // FlareSolverr only GETs a single URL, so fold the query params into it.
            return self.flaresolverr_fetch("request.get", &append_query(url, query), None);
        }
        self.throttle();
        let mut f = self.base_fetch();
        for (k, v) in query {
            f = f.query(k, v.clone());
        }
        let resp = f.get(url).with_context(|| format!("GET {url}"))?;
        Ok(resp.text())
    }

    fn post_form_text(&self, url: &str, fields: &[(String, String)]) -> Result<String> {
        if self.flaresolverr.is_some() {
            // Cloudflare-fronted POST logins/searches must go through FlareSolverr
            // too, or they get the challenge page back.
            return self.flaresolverr_fetch("request.post", url, Some(form_encode(fields)));
        }
        self.throttle();
        let refs: Vec<(&str, &str)> = fields.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
        let resp = self.base_fetch().post_form(url, &refs).with_context(|| format!("POST {url}"))?;
        Ok(resp.text())
    }

    /// Fetch a `.torrent` file's bytes through the session (cookies applied), so
    /// private-tracker links resolve. Fails on a non-2xx or a clearly-HTML body.
    pub fn fetch_torrent(&self, url: &str) -> Result<Vec<u8>> {
        self.throttle();
        let resp = self.base_fetch().get(url)?.ensure_ok()?;
        let body = resp.body;
        if body.starts_with(b"<!DOCTYPE") || body.starts_with(b"<html") {
            bail!("expected a .torrent, got an HTML page (login/session issue?)");
        }
        Ok(body)
    }

    fn flaresolverr_fetch(&self, cmd: &str, url: &str, post_data: Option<String>) -> Result<String> {
        let base = self.flaresolverr.as_ref().unwrap().trim_end_matches('/');
        self.throttle();
        let body = flaresolverr_body(cmd, url, post_data);
        let resp: serde_json::Value = self
            .base_fetch()
            .post_json(&format!("{base}/v1"), &body)?
            .ensure_ok()?
            .json()?;
        resp.get("solution")
            .and_then(|s| s.get("response"))
            .and_then(|r| r.as_str())
            .map(str::to_string)
            .ok_or_else(|| anyhow::anyhow!("FlareSolverr returned no solution.response"))
    }
    // A tracker that answered "too many requests" means it, and the definition's
    // own request delay is about spacing, not about serving a penalty.
    fn hold_off(&self, wait: Duration) {
        let until = Instant::now() + wait;
        let mut st = self.state.lock().unwrap();
        st.next_allowed = Some(st.next_allowed.map_or(until, |n| n.max(until)));
    }

    /// Forget that this session logged in, so the next search does it again.
    /// Called when a response says the credentials or the session are no good.
    pub fn invalidate_login(&self) {
        self.state.lock().unwrap().logged_in = false;
    }

    /// Server title (definition name) + reachability, for the admin test button.
    pub fn test(&self) -> Result<String> {
        self.ensure_login()?;
        Ok(self.def.name.clone())
    }
}

// One jar per indexer id so two configs never share a session.
fn cookie_jar_path(data_dir: &Path, indexer_id: &str) -> PathBuf {
    let safe: String = indexer_id.chars().map(|c| if c.is_alphanumeric() { c } else { '_' }).collect();
    data_dir.join("indexers").join(format!("{safe}.cookies"))
}

// The FlareSolverr `/v1` request body (`postData` set only for `request.post`).
fn flaresolverr_body(cmd: &str, url: &str, post_data: Option<String>) -> serde_json::Value {
    let mut body = serde_json::json!({ "cmd": cmd, "url": url, "maxTimeout": 60000 });
    if let Some(pd) = post_data {
        body["postData"] = serde_json::Value::String(pd);
    }
    body
}

fn append_query(url: &str, query: &[(String, String)]) -> String {
    if query.is_empty() {
        return url.to_string();
    }
    let sep = if url.contains('?') { '&' } else { '?' };
    format!("{url}{sep}{}", form_encode(query))
}

fn form_encode(fields: &[(String, String)]) -> String {
    fields
        .iter()
        .map(|(k, v)| format!("{}={}", crate::filters::url_encode(k), crate::filters::url_encode(v)))
        .collect::<Vec<_>>()
        .join("&")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jar_path_is_sanitized_and_stable() {
        let dir = Path::new("/data");
        let a = cookie_jar_path(dir, "torrent-leech");
        assert_eq!(a, cookie_jar_path(dir, "torrent-leech"));
        assert_eq!(a, Path::new("/data/indexers/torrent_leech.cookies"));
    }

    #[test]
    fn flaresolverr_request_shape() {
        let body = flaresolverr_body("request.get", "https://x.to/s?q=a", None);
        assert_eq!(body["cmd"], "request.get");
        assert_eq!(body["url"], "https://x.to/s?q=a");
        assert_eq!(body["maxTimeout"], 60000);
        assert!(body.get("postData").is_none());
        let post = flaresolverr_body("request.post", "https://x.to/login", Some("u=a&p=b".into()));
        assert_eq!(post["postData"], "u=a&p=b");
    }

    #[test]
    fn append_query_and_form_encode() {
        let q = vec![("q".to_string(), "the matrix".to_string()), ("cat".to_string(), "1,2".to_string())];
        assert_eq!(append_query("https://x/a", &q), "https://x/a?q=the%20matrix&cat=1%2C2");
        assert_eq!(append_query("https://x/a?p=1", &q), "https://x/a?p=1&q=the%20matrix&cat=1%2C2");
        assert_eq!(append_query("https://x/a", &[]), "https://x/a");
    }
}
