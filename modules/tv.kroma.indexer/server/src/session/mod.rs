//! The network layer: a per-indexer [`Session`] that fetches through `kroma-http`,
//! keeping a cookie jar, driving the login flow, and optionally routing through
//! the VPN or a FlareSolverr instance.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use anyhow::{bail, Context as _, Result};
use kroma_module_sdk::db::Pool;

use crate::context::Context;
use crate::definition::Definition;
use crate::{engine, template, IndexerConfig, Release};

use pace::Pace;

mod download;
mod login;
mod pace;
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
    pace: Pace,
    state: Mutex<SessionState>,
}

#[derive(Default)]
struct SessionState {
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
    /// `store` is this module's own database, where the tracker's pacing lives:
    /// every instance of this module asks the same tracker.
    pub fn new(
        store: Pool,
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
            pace: Pace::new(store, indexer_id),
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
            .purpose("indexer")
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

    fn throttle(&self) -> Result<()> {
        let delay = match self.def.request_delay {
            Some(d) if d > 0.0 => Duration::from_secs_f64(d),
            _ => return Ok(()),
        };
        let wait = self.pace.reserve(delay).context("reserve a request slot")?;
        if !wait.is_zero() {
            std::thread::sleep(wait);
        }
        Ok(())
    }

    fn get_text(&self, url: &str, query: &[(String, String)]) -> Result<String> {
        if self.flaresolverr.is_some() {
            // FlareSolverr only GETs a single URL, so fold the query params into it.
            return self.flaresolverr_fetch("request.get", &append_query(url, query), None);
        }
        self.throttle()?;
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
        self.throttle()?;
        let refs: Vec<(&str, &str)> = fields
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        let resp = self
            .base_fetch()
            .post_form(url, &refs)
            .with_context(|| format!("POST {url}"))?;
        Ok(resp.text())
    }

    /// Fetch a `.torrent` file's bytes through the session (cookies applied), so
    /// private-tracker links resolve. Fails on a non-2xx or a clearly-HTML body.
    pub fn fetch_torrent(&self, url: &str) -> Result<Vec<u8>> {
        self.throttle()?;
        let resp = self
            .base_fetch()
            .purpose("torrent-file")
            .get(url)?
            .ensure_ok()?;
        let body = resp.body;
        if body.starts_with(b"<!DOCTYPE") || body.starts_with(b"<html") {
            bail!("expected a .torrent, got an HTML page (login/session issue?)");
        }
        Ok(body)
    }

    fn flaresolverr_fetch(
        &self,
        cmd: &str,
        url: &str,
        post_data: Option<String>,
    ) -> Result<String> {
        let base = self.flaresolverr.as_ref().unwrap().trim_end_matches('/');
        self.throttle()?;
        let body = flaresolverr_body(cmd, url, post_data);
        let resp: serde_json::Value = self
            .base_fetch()
            .purpose("flaresolverr")
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
        if let Err(error) = self.pace.hold_off(wait) {
            tracing::warn!(indexer = %self.def.name, error = %format!("{error:#}"), "the hold-off was not recorded");
        }
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
    let safe: String = indexer_id
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();
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
        .map(|(k, v)| {
            format!(
                "{}={}",
                crate::filters::url_encode(k),
                crate::filters::url_encode(v)
            )
        })
        .collect::<Vec<_>>()
        .join("&")
}

#[cfg(test)]
mod tests;
