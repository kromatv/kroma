//! The network layer: a per-indexer [`Session`] that fetches over `curl`
//! (via `kroma-http`), keeping a cookie jar, driving the login flow, and
//! optionally routing through a SOCKS5 proxy or a FlareSolverr instance.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use anyhow::{bail, Context as _, Result};

use scraper::ElementRef;

use crate::context::Context;
use crate::definition::{Definition, Download, Login};
use crate::selector;
use crate::{engine, template, IndexerConfig, Query, Release};

// A desktop-browser User-Agent: many trackers 403 the default curl UA.
const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const MAX_TIME_SECS: u32 = 45;

// How long a tracker that answered 429 is left alone for.
const RATE_LIMIT_COOLDOWN: Duration = Duration::from_secs(60);

// Enough of a body to recognise an error document or an empty result set,
// short enough that a log line stays a log line.
const MAX_SNIPPET: usize = 400;

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

    /// No-op for public trackers. Verifies via the login `test` selector and
    /// re-logs-in when needed.
    pub fn ensure_login(&self) -> Result<()> {
        let Some(login) = self.def.login.clone() else { return Ok(()) };
        let has_test = login.test.is_some();
        // Without a `test` block there is no cheap way to confirm the session,
        // so a login already done in this process is trusted. It used to
        // re-login on EVERY search, doubling the request rate against trackers
        // that count them; `invalidate_login` puts it back when one goes sour.
        if !has_test && self.state.lock().unwrap().logged_in {
            return Ok(());
        }
        // A `test` block lets us cheaply confirm an existing session and skip
        // re-logging-in.
        if has_test && self.login_ok(&login)? {
            self.state.lock().unwrap().logged_in = true;
            return Ok(());
        }
        // `perform_login` errors if the definition's `error` selectors match,
        // which is the only success signal for logins with no `test` block.
        self.perform_login(&login)?;
        if has_test && !self.login_ok(&login)? {
            bail!("login appeared to succeed but the test check failed");
        }
        self.state.lock().unwrap().logged_in = true;
        Ok(())
    }

    fn login_ok(&self, login: &Login) -> Result<bool> {
        let Some(test) = &login.test else { return Ok(false) };
        let url = self.url_for(test.path.as_deref().unwrap_or(""));
        let html = self.get_text(&url, &[])?;
        match &test.selector {
            Some(sel) => {
                let doc = selector::parse_document(&html);
                Ok(selector::select_first(doc.root_element(), sel).is_some())
            }
            None => Ok(true),
        }
    }

    fn perform_login(&self, login: &Login) -> Result<()> {
        let method = login.method.as_deref().unwrap_or("form");
        let ctx = Context::with_config(&self.def, &self.cfg);
        match method {
            "cookie" => {
                // A user-pasted Cookie header value, applied to every request.
                let cookie = login
                    .inputs
                    .get("cookie")
                    .map(|v| template::render(v, &ctx))
                    .or_else(|| login.cookies.first().map(|c| template::render(c, &ctx)))
                    .unwrap_or_default();
                self.state.lock().unwrap().cookie_header = Some(cookie);
                Ok(())
            }
            "get" => {
                let url = self.url_for(login.path.as_deref().unwrap_or(""));
                let query: Vec<(String, String)> =
                    login.inputs.iter().map(|(k, v)| (k.clone(), template::render(v, &ctx))).collect();
                let html = self.get_text(&url, &query)?;
                self.check_login_errors(login, &html)
            }
            "post" | "getpost" => {
                let path = login.submitpath.clone().or_else(|| login.path.clone()).unwrap_or_default();
                let url = self.url_for(&path);
                let fields: Vec<(String, String)> =
                    login.inputs.iter().map(|(k, v)| (k.clone(), template::render(v, &ctx))).collect();
                let html = self.post_form_text(&url, &fields)?;
                self.check_login_errors(login, &html)
            }
            // "form" (default) and "oneurl": scrape the form, merge inputs, submit.
            _ => self.perform_form_login(login, &ctx),
        }
    }

    fn perform_form_login(&self, login: &Login, ctx: &Context) -> Result<()> {
        let page_url = self.url_for(login.path.as_deref().unwrap_or(""));
        let page = self.get_text(&page_url, &[])?;
        let form_sel = login.form.as_deref().unwrap_or("form");
        let ScrapedForm { action, mut fields } = scrape_form(&page, form_sel, &page_url, &self.rendered_base());

        // Values scraped from named page elements (CSRF tokens, etc).
        {
            let doc = selector::parse_document(&page);
            let root = doc.root_element();
            for (name, sel) in &login.selectorinputs {
                if let Some(s) = &sel.selector {
                    if let Some(el) = selector::select_first(root, s) {
                        let val = match &sel.attribute {
                            Some(a) => selector::element_attr(el, a).unwrap_or_default(),
                            None => selector::element_text(el),
                        };
                        set_field(&mut fields, name, val);
                    }
                }
            }
        }
        // Templated inputs (username/password/…) win over scraped defaults.
        for (name, tmpl) in &login.inputs {
            set_field(&mut fields, name, template::render(tmpl, ctx));
        }

        let html = self.post_form_text(&action, &fields)?;
        self.check_login_errors(login, &html)
    }

    fn check_login_errors(&self, login: &Login, html: &str) -> Result<()> {
        let doc = selector::parse_document(html);
        let root = doc.root_element();
        for err in &login.error {
            if let Some(sel) = &err.selector {
                if let Some(el) = selector::select_first(root, sel) {
                    let msg = err
                        .message
                        .as_ref()
                        .and_then(|m| m.text.clone())
                        .unwrap_or_else(|| selector::element_text(el));
                    bail!("login failed: {}", msg.trim());
                }
            }
        }
        Ok(())
    }

    /// Run `query` against this indexer: log in if needed, fetch each search
    /// path, and parse the responses into releases.
    pub fn search(&self, query: &Query, wanted_cats: &[u32]) -> SearchOutcome {
        let mut outcome = SearchOutcome::default();
        if let Err(e) = self.ensure_login() {
            tracing::warn!(indexer = %self.def.name, error = %format!("{e:#}"), "login failed");
            outcome.errors.push(format!("{}: login: {e:#}", self.def.name));
            return outcome;
        }
        let requests = engine::build_requests(&self.def, &self.cfg, query, wanted_cats);
        tracing::info!(
            indexer = %self.def.name,
            keywords = %query.keywords(),
            wanted_categories = ?wanted_cats,
            paths = requests.len(),
            "searching",
        );
        if requests.is_empty() {
            tracing::warn!(
                indexer = %self.def.name,
                wanted_categories = ?wanted_cats,
                "definition produced no search path for this query; nothing was asked",
            );
        }
        let mut seen = std::collections::HashSet::new();
        for req in requests {
            self.search_one(&req, &mut seen, &mut outcome);
        }
        tracing::info!(
            indexer = %self.def.name,
            releases = outcome.releases.len(),
            errors = outcome.errors.len(),
            "search done",
        );
        outcome
    }

    fn search_one(
        &self,
        req: &engine::SearchRequest,
        seen: &mut std::collections::HashSet<String>,
        outcome: &mut SearchOutcome,
    ) {
        let fetched = match req.method.as_str() {
            "post" => self.post_form_text(&req.url, &req.inputs),
            _ => self.get_text(&req.url, &req.inputs),
        };
        let body = match fetched {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!(
                    indexer = %self.def.name,
                    url = %req.url,
                    method = %req.method,
                    error = %format!("{e:#}"),
                    "fetch failed",
                );
                outcome.errors.push(format!("{}: {e:#}", self.def.name));
                return;
            }
        };
        let bytes = body.len();
        let body = engine::preprocess(&self.def, &self.cfg, &body);
        if let Some(message) = refusal(&req.response_kind, &body) {
            self.note_refusal(req, bytes, &message, outcome);
            return;
        }
        let parsed = match req.response_kind.as_str() {
            "json" => engine::parse_json(&self.def, &self.cfg, &body),
            "xml" => engine::parse_xml(&self.def, &self.cfg, &body),
            _ => engine::parse_html_auto(&self.def, &self.cfg, &body),
        };
        match parsed {
            Ok(rels) => {
                self.note_parsed(req, bytes, &body, rels.len());
                for r in rels {
                    if seen.insert(r.guid.clone()) {
                        outcome.releases.push(r);
                    }
                }
            }
            Err(e) => {
                tracing::warn!(
                    indexer = %self.def.name,
                    url = %req.url,
                    bytes,
                    kind = %req.response_kind,
                    error = %format!("{e:#}"),
                    "parse failed",
                );
                outcome.errors.push(format!("{}: parse: {e:#}", self.def.name));
            }
        }
    }

    // A tracker that refuses the query answers 200 with an error document, which
    // parses to zero rows and used to read as "nothing found". It is the indexer
    // failing, and has to be reported as one.
    fn note_refusal(
        &self,
        req: &engine::SearchRequest,
        bytes: usize,
        message: &str,
        outcome: &mut SearchOutcome,
    ) {
        tracing::warn!(
            indexer = %self.def.name,
            url = %req.url,
            bytes,
            error = %message,
            "the tracker returned an error document",
        );
        if message.contains("429") {
            // Rate limited: stop asking for a while, rather than spending the
            // next search's budget re-earning the same refusal.
            self.hold_off(RATE_LIMIT_COOLDOWN);
        } else {
            // Anything else it refuses may be the session, so the next search
            // logs in again rather than reusing a dead one.
            self.invalidate_login();
        }
        outcome.errors.push(format!("{}: {message}", self.def.name));
    }

    // Parsed-but-empty is the failure that used to be invisible: the tracker
    // answered, and either it genuinely has nothing or the definition's row
    // selector no longer matches its markup. The body is the only thing that
    // tells the two apart, so a short one is quoted rather than described.
    fn note_parsed(&self, req: &engine::SearchRequest, bytes: usize, body: &str, rows: usize) {
        if rows == 0 {
            // Except when the feed already answered the question: a newznab
            // response header saying `total="0"` is the tracker stating it has
            // nothing, so warning about selectors there cries wolf on the one
            // case that is working exactly as designed.
            if declared_empty(body) {
                tracing::info!(
                    indexer = %self.def.name,
                    url = %req.url,
                    bytes,
                    "the tracker has nothing for this query",
                );
                return;
            }
            tracing::warn!(
                indexer = %self.def.name,
                url = %req.url,
                bytes,
                kind = %req.response_kind,
                body = %snippet(body),
                "answered, but no row matched the definition's selectors",
            );
        } else {
            tracing::info!(
                indexer = %self.def.name,
                url = %req.url,
                bytes,
                kind = %req.response_kind,
                parsed = rows,
                "response parsed",
            );
        }
    }

    /// Refuse to talk to this tracker for `wait`. A tracker that answered "too
    /// many requests" means it, and the definition's own request delay is about
    /// spacing, not about serving a penalty.
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

    /// Turn a search result into something grabbable: its magnet if present,
    /// else the `.torrent` link, else by fetching the details page and applying
    /// the definition's `download` selectors / infohash rule.
    pub fn resolve_download(&self, release: &Release) -> Result<DownloadTarget> {
        if let Some(m) = &release.magnet {
            return Ok(DownloadTarget::Magnet(m.clone()));
        }
        if let Some(download) = &self.def.download {
            let details = release
                .details_url
                .clone()
                .or_else(|| release.link.clone())
                .ok_or_else(|| anyhow::anyhow!("no details page to resolve the download from"))?;
            let page = self.get_text(&details, &[])?;
            let doc = selector::parse_document(&page);
            let root = doc.root_element();
            let ctx = Context::with_config(&self.def, &self.cfg);

            if let Some(target) = self.download_from_selectors(download, root, &ctx) {
                return Ok(target);
            }
            // Fall back to an infohash rule -> synthesize a magnet.
            if let Some(target) = self.download_from_infohash(download, root, release) {
                return Ok(target);
            }
            bail!("download selectors matched nothing on the details page");
        }
        if let Some(link) = &release.link {
            return Ok(classify_target(link));
        }
        bail!("release has no magnet, link, or download rule")
    }

    // Tries selectors in order and skips an empty match, rather than stopping
    // at the first selector that merely exists.
    fn download_from_selectors(
        &self,
        download: &Download,
        root: ElementRef,
        ctx: &Context,
    ) -> Option<DownloadTarget> {
        for sel in &download.selectors {
            let Some(css) = &sel.selector else { continue };
            let css = template::render(css, ctx);
            if let Some(el) = selector::select_first(root, &css) {
                let val = match &sel.attribute {
                    Some(a) => selector::element_attr(el, a).unwrap_or_default(),
                    None => selector::element_text(el),
                };
                if val.is_empty() {
                    continue;
                }
                return Some(classify_target(&engine::join_url(&self.rendered_base(), &val)));
            }
        }
        None
    }

    fn download_from_infohash(
        &self,
        download: &Download,
        root: ElementRef,
        release: &Release,
    ) -> Option<DownloadTarget> {
        let ih = download.infohash.as_ref()?;
        let hash_sel =
            ih.hash.as_ref().and_then(|h| h.selector.clone()).or_else(|| ih.selector.clone())?;
        let el = selector::select_first(root, &hash_sel)?;
        let hash = match &ih.attribute {
            Some(a) => selector::element_attr(el, a).unwrap_or_default(),
            None => selector::element_text(el),
        };
        if hash.is_empty() {
            return None;
        }
        Some(DownloadTarget::Magnet(format!(
            "magnet:?xt=urn:btih:{hash}&dn={}",
            crate::filters::url_encode(&release.title)
        )))
    }
}

// One jar per indexer id so two configs never share a session.
/// The first [`MAX_SNIPPET`] characters of a response, whitespace-collapsed onto
/// one line, so a log can say what came back rather than only that it was
/// unusable.
fn snippet(body: &str) -> String {
    let flat = body.split_whitespace().collect::<Vec<_>>().join(" ");
    match flat.char_indices().nth(MAX_SNIPPET) {
        Some((cut, _)) => format!("{}...", &flat[..cut]),
        None => flat,
    }
}

/// Whether a torznab/newznab feed states in its own response header that it has
/// no results, which separates an honest empty answer from a broken selector.
fn declared_empty(body: &str) -> bool {
    let Some(start) = body.find(":response") else { return false };
    let rest = &body[start..];
    let end = rest.find('>').unwrap_or(rest.len());
    attr(&rest[..end], "total").is_some_and(|t| t.trim() == "0")
}

/// The message a tracker refused the query with, when it answered 200 and a body
/// that is not results: either a Torznab/Newznab `<error>` document, or - for a
/// path that declared `xml`/`json` - something that is not that document at all.
///
/// The second case is not hypothetical: YggReborn answers a bad `t=` with the
/// twenty bare bytes `unsupported function`, which parsed to zero rows and was
/// reported as "no row matched the definition's selectors". That sends whoever
/// reads the log to the selectors, which were fine, and it skipped the
/// invalidate-login / back-off handling a refusal is supposed to trigger.
fn refusal(kind: &str, body: &str) -> Option<String> {
    let head = body.trim_start().trim_start_matches('\u{feff}').trim_start();
    let opener = match kind {
        "xml" => '<',
        "json" => {
            if head.starts_with('{') || head.starts_with('[') {
                return api_error(body);
            }
            return Some(format!("the indexer did not answer json: {}", snippet(body)));
        }
        // `html` is the default kind and covers whatever a scraped page returns,
        // so its shape says nothing; only a real `<error>` document counts.
        _ => return api_error(body),
    };
    if !head.starts_with(opener) {
        return Some(format!("the indexer did not answer xml: {}", snippet(body)));
    }
    api_error(body)
}

/// The message from a Torznab/Newznab `<error>` document, which a tracker
/// answers 200 with when it refuses the query (bad key, unknown category, rate
/// limit). Parsing it as results would silently yield nothing.
fn api_error(body: &str) -> Option<String> {
    let head = body.trim_start();
    if !head.starts_with('<') {
        return None;
    }
    let start = body.find("<error")?;
    let rest = &body[start..];
    let end = rest.find("/>").or_else(|| rest.find('>'))?;
    let tag = &rest[..end];
    let code = attr(tag, "code");
    let description = attr(tag, "description").or_else(|| attr(tag, "message"));
    match (code, description) {
        (Some(code), Some(description)) => Some(format!("tracker error {code}: {description}")),
        (None, Some(description)) => Some(format!("tracker error: {description}")),
        (Some(code), None) => Some(format!("tracker error {code}")),
        (None, None) => Some("tracker returned an error document".to_string()),
    }
}

fn attr(tag: &str, name: &str) -> Option<String> {
    let at = tag.find(&format!("{name}=\""))?;
    let rest = &tag[at + name.len() + 2..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

fn cookie_jar_path(data_dir: &Path, indexer_id: &str) -> PathBuf {
    let safe: String = indexer_id.chars().map(|c| if c.is_alphanumeric() { c } else { '_' }).collect();
    data_dir.join("indexers").join(format!("{safe}.cookies"))
}

fn classify_target(url: &str) -> DownloadTarget {
    if url.starts_with("magnet:") {
        DownloadTarget::Magnet(url.to_string())
    } else {
        DownloadTarget::TorrentUrl(url.to_string())
    }
}

struct ScrapedForm {
    action: String,
    fields: Vec<(String, String)>,
}

fn scrape_form(html: &str, form_sel: &str, page_url: &str, base_url: &str) -> ScrapedForm {
    let doc = selector::parse_document(html);
    let root = doc.root_element();
    let form = selector::select_first(root, form_sel).or_else(|| selector::select_first(root, "form"));
    let (action, fields) = match form {
        Some(f) => {
            let action = selector::element_attr(f, "action")
                .filter(|a| !a.is_empty())
                .map(|a| engine::join_url(base_url, &a))
                .unwrap_or_else(|| page_url.to_string());
            let mut fields = Vec::new();
            for input in selector::select_all(f, "input") {
                if let Some(name) = selector::element_attr(input, "name") {
                    let value = selector::element_attr(input, "value").unwrap_or_default();
                    fields.push((name, value));
                }
            }
            (action, fields)
        }
        None => (page_url.to_string(), Vec::new()),
    };
    ScrapedForm { action, fields }
}

fn set_field(fields: &mut Vec<(String, String)>, name: &str, value: String) {
    if let Some(pair) = fields.iter_mut().find(|(k, _)| k == name) {
        pair.1 = value;
    } else {
        fields.push((name.to_string(), value));
    }
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
    fn classify_download_target() {
        assert_eq!(classify_target("magnet:?xt=1"), DownloadTarget::Magnet("magnet:?xt=1".into()));
        assert_eq!(
            classify_target("https://x/t.torrent"),
            DownloadTarget::TorrentUrl("https://x/t.torrent".into())
        );
    }

    #[test]
    fn scrapes_form_action_and_hidden_inputs() {
        let html = r#"
          <form id="login" action="/user/login" method="post">
            <input type="hidden" name="csrf" value="tok123">
            <input type="text" name="username" value="">
            <input type="password" name="password">
          </form>
        "#;
        let form = scrape_form(html, "form#login", "https://x.to/login", "https://x.to/");
        assert_eq!(form.action, "https://x.to/user/login");
        assert_eq!(form.fields.iter().find(|(k, _)| k == "csrf").unwrap().1, "tok123");
        assert!(form.fields.iter().any(|(k, _)| k == "username"));
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

    #[test]
    fn set_field_overwrites_then_appends() {
        let mut f = vec![("a".to_string(), "1".to_string())];
        set_field(&mut f, "a", "2".into());
        set_field(&mut f, "b", "3".into());
        assert_eq!(f, vec![("a".into(), "2".into()), ("b".into(), "3".into())]);
    }
}

#[cfg(test)]
mod response_tests {
    use super::*;

    #[test]
    fn a_torznab_error_document_is_an_error_not_an_empty_result() {
        let body = r#"<?xml version="1.0"?><error code="100" description="Incorrect user credentials"/>"#;
        assert_eq!(
            api_error(body).as_deref(),
            Some("tracker error 100: Incorrect user credentials"),
        );
    }

    #[test]
    fn a_real_result_set_is_not_an_error() {
        assert!(api_error(r#"<rss><channel><item><title>x</title></item></channel></rss>"#).is_none());
    }

    #[test]
    fn an_empty_result_set_is_not_an_error_either() {
        assert!(api_error(r#"<rss><channel></channel></rss>"#).is_none());
    }

    #[test]
    fn an_html_page_mentioning_error_elsewhere_is_left_alone() {
        assert!(api_error("<html><body>no errors here</body></html>").is_none());
    }

    // The twenty bytes YggReborn answers a `t=` it does not know with. Not XML,
    // so `api_error` never saw it and it was reported as a selector miss.
    const BARE_REFUSAL: &str = "unsupported function";

    #[test]
    fn a_bare_text_body_on_an_xml_path_is_a_refusal() {
        let msg = refusal("xml", BARE_REFUSAL).expect("a refusal");
        assert!(msg.contains("did not answer xml"), "{msg}");
        assert!(msg.contains(BARE_REFUSAL), "{msg}");
        // Same body on a scraped page says nothing: html is the catch-all kind.
        assert!(refusal("html", BARE_REFUSAL).is_none());
    }

    #[test]
    fn a_login_page_served_to_a_json_path_is_a_refusal_too() {
        // The session died and the tracker answered the sign-in form. It parses
        // to zero rows, but the fix is to log in again, not to touch selectors.
        let msg = refusal("json", "<html><body>Please sign in</body></html>").expect("a refusal");
        assert!(msg.contains("did not answer json"), "{msg}");
    }

    #[test]
    fn a_byte_order_mark_does_not_make_valid_markup_a_refusal() {
        let msg = refusal("xml", "\u{feff}<?xml version=\"1.0\"?><rss><channel/></rss>");
        assert!(msg.is_none(), "{msg:?}");
    }

    #[test]
    fn a_well_formed_feed_is_not_a_refusal() {
        let feed = r#"<?xml version="1.0"?><rss><channel><item/></channel></rss>"#;
        assert!(refusal("xml", feed).is_none());
        assert!(refusal("json", r#"{"results":[]}"#).is_none());
        assert!(refusal("json", "[]").is_none());
    }

    #[test]
    fn a_feed_declaring_no_results_is_an_honest_empty() {
        // The body YggReborn returns for a title it does not carry: warning about
        // selectors here buries the searches that really are broken.
        let empty = r#"<?xml version="1.0" encoding="UTF-8"?>
          <rss version="2.0" xmlns:newznab="http://www.newznab.com/DTD/2010/feeds/attributes/">
            <channel><title>YggReborn</title>
              <newznab:response offset="0" total="0"/>
            </channel>
          </rss>"#;
        assert!(declared_empty(empty));
        assert!(!declared_empty(r#"<newznab:response offset="0" total="14"/>"#));
        // No header at all: the two cases stay indistinguishable, so it warns.
        assert!(!declared_empty(r#"<rss><channel></channel></rss>"#));
    }

    #[test]
    fn a_snippet_is_one_line_and_bounded() {
        let long = "a\n  b\n".repeat(500);
        let out = snippet(&long);
        assert!(!out.contains('\n'));
        assert!(out.chars().count() <= MAX_SNIPPET + 3);
    }
}
