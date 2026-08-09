//! The core side of the out-of-process module system: spawns each installed
//! module's binary, reverse-proxies to it, and serves the `/api/_host/*` callback API.

mod discover;

use std::borrow::Cow;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::from_fn_with_state;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use kroma_module_host::host_token::{require_host_token, HostToken};
use kroma_module_host::{Event, HostCtx};
use serde_json::{json, Value};

pub const MODULE_BIN: &str = "module";

struct Proc {
    port: u16,
    child: Child,
}

#[derive(Clone)]
pub struct SupervisorConfig {
    pub modules_dir: PathBuf,
    pub core_url: String,
    pub host_token: String,
    pub db_path: PathBuf,
    pub data_dir: PathBuf,
    pub reserved_ids: Vec<String>,
    pub server_version: String,
    pub log_line: Option<Arc<dyn Fn(&str, &str) + Send + Sync>>,
}

pub struct Supervisor {
    cfg: SupervisorConfig,
    procs: RwLock<HashMap<String, Proc>>,
    manifests_cache: RwLock<Option<Vec<Value>>>,
    // Short-TTL catalog cache: the admin flow sweeps EVERY registry from the
    // catalog view, the plan dialog (once per opt-in toggle) and the install
    // itself in quick succession; within the TTL they share one fetch.
    catalog_cache: RwLock<HashMap<String, (std::time::Instant, Value)>>,
    // Built once each: constructing a client parses the whole root certificate
    // store, and the catalog path builds one per registry in the list.
    catalog_client: std::sync::OnceLock<reqwest::Client>,
    artifact_client: std::sync::OnceLock<reqwest::Client>,
}

// A registry catalog is a small JSON index (the first-party one is a few kB);
// anything approaching this is a misconfigured or hostile host, not a catalog.
const MAX_CATALOG_BYTES: u64 = 4 * 1024 * 1024;
const CATALOG_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);
/// Ceiling on an installable `.kmod`: a sidecar binary plus a small frontend
/// bundle. The upload route bounds its body with this too, so a bundle that can
/// be uploaded can also be fetched by URL.
pub const MAX_BUNDLE_BYTES: u64 = 64 * 1024 * 1024;
const ARTIFACT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);
// Long enough to cover one admin interaction (plan, toggle, install), short
// enough that a freshly published catalog shows up on the next page visit.
const CATALOG_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(15);

/// Byte-progress callback for a bounded fetch: `(received, total)` where
/// `total` is the advisory Content-Length when the server sent one.
pub type FetchProgress<'a> = &'a (dyn Fn(u64, Option<u64>) + Send + Sync);

/// Read a response body with a hard ceiling, enforced as it arrives.
///
/// Content-Length is advisory (absent under chunked encoding), so the header
/// check is only an early exit; the running total is what actually bounds it.
async fn fetch_bounded(
    client: &reqwest::Client,
    url: &str,
    max_bytes: u64,
    on_progress: Option<FetchProgress<'_>>,
) -> anyhow::Result<Vec<u8>> {
    let mut response = client.get(url).send().await?.error_for_status()?;
    let total = response.content_length();
    if let Some(len) = total {
        if len > max_bytes {
            anyhow::bail!("response is {len} bytes (max {max_bytes})");
        }
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        body.extend_from_slice(&chunk);
        if body.len() as u64 > max_bytes {
            anyhow::bail!("response exceeds {max_bytes} bytes");
        }
        if let Some(progress) = on_progress {
            progress(body.len() as u64, total);
        }
    }
    Ok(body)
}

/// Follow redirects, but never from https down to http: the catalog carries
/// both an artifact URL and the checksum that vouches for it, so a downgrade
/// would hand an on-path attacker each half and make the verification empty.
fn no_downgrade() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        let came_from_https = attempt.previous().iter().any(|u| u.scheme() == "https");
        if came_from_https && attempt.url().scheme() != "https" {
            return attempt.error("redirect from https to http refused");
        }
        if attempt.previous().len() > 10 {
            return attempt.stop();
        }
        attempt.follow()
    })
}

impl Supervisor {
    pub fn new(cfg: SupervisorConfig) -> Arc<Self> {
        Arc::new(Self {
            cfg,
            procs: RwLock::new(HashMap::new()),
            manifests_cache: RwLock::new(None),
            catalog_cache: RwLock::new(HashMap::new()),
            catalog_client: std::sync::OnceLock::new(),
            artifact_client: std::sync::OnceLock::new(),
        })
    }

    fn dir(&self, id: &str) -> PathBuf {
        self.cfg.modules_dir.join(id)
    }

    fn has_binary(&self, id: &str) -> bool {
        self.dir(id).join(MODULE_BIN).exists()
    }

    /// Every installed module's `module.json` (best-effort), cached until the
    /// next install or uninstall.
    pub fn installed_manifests(&self) -> Vec<Value> {
        if let Some(cached) = self.manifests_cache.read().unwrap().clone() {
            return cached;
        }
        let scanned = self.scan_manifests();
        *self.manifests_cache.write().unwrap() = Some(scanned.clone());
        scanned
    }

    fn scan_manifests(&self) -> Vec<Value> {
        let Ok(entries) = std::fs::read_dir(&self.cfg.modules_dir) else {
            return Vec::new();
        };
        entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .filter_map(|e| std::fs::read_to_string(e.path().join("module.json")).ok())
            .filter_map(|s| serde_json::from_str(&s).ok())
            .collect()
    }

    fn invalidate_manifests(&self) {
        *self.manifests_cache.write().unwrap() = None;
    }

    /// The ids of every runtime-installed (`.kmod`) module — not the ones
    /// compiled into this server.
    pub fn installed_ids(&self) -> Vec<String> {
        self.installed_manifests()
            .into_iter()
            .filter_map(|m| m.get("id").and_then(Value::as_str).map(str::to_string))
            .collect()
    }

    /// A runtime-installed module's packaged icon bytes, svg preferred over png.
    pub fn icon(&self, id: &str) -> Option<(&'static str, Vec<u8>)> {
        let dir = self.dir(id);
        if let Ok(bytes) = std::fs::read(dir.join("icon.svg")) {
            return Some(("image/svg+xml", bytes));
        }
        if let Ok(bytes) = std::fs::read(dir.join("icon.png")) {
            return Some(("image/png", bytes));
        }
        None
    }

    pub fn port_of(&self, id: &str) -> Option<u16> {
        self.procs.read().unwrap().get(id).map(|p| p.port)
    }

    pub fn host_token(&self) -> &str {
        &self.cfg.host_token
    }

    /// Spawn a module process on a free localhost port; a no-op if already
    /// running, an error if the module ships no binary.
    pub fn spawn(&self, id: &str) -> anyhow::Result<u16> {
        if let Some(p) = self.procs.read().unwrap().get(id) {
            return Ok(p.port);
        }
        let bin = self.dir(id).join(MODULE_BIN);
        if !bin.exists() {
            anyhow::bail!("module binary missing: {}", bin.display());
        }
        let port = free_port()?;
        let piped = self.cfg.log_line.is_some();
        let stdio = || if piped { Stdio::piped() } else { Stdio::inherit() };
        let mut child = Command::new(&bin)
            .env("KROMA_MODULE_ID", id)
            .env("KROMA_MODULE_PORT", port.to_string())
            .env("KROMA_CORE_URL", &self.cfg.core_url)
            .env("KROMA_HOST_TOKEN", &self.cfg.host_token)
            .env("KROMA_DB_PATH", &self.cfg.db_path)
            .env("KROMA_DATA_DIR", &self.cfg.data_dir)
            .stdout(stdio())
            .stderr(stdio())
            .spawn()?;
        if let Some(log_line) = &self.cfg.log_line {
            Self::drain_logs(&mut child, id, log_line);
        }
        tracing::info!(module = %id, port, pid = child.id(), "spawned module process");
        self.procs.write().unwrap().insert(id.to_string(), Proc { port, child });
        Ok(port)
    }

    fn drain_logs(child: &mut Child, id: &str, log_line: &Arc<dyn Fn(&str, &str) + Send + Sync>) {
        for pipe in [
            child.stdout.take().map(|p| Box::new(p) as Box<dyn std::io::Read + Send>),
            child.stderr.take().map(|p| Box::new(p) as Box<dyn std::io::Read + Send>),
        ]
        .into_iter()
        .flatten()
        {
            let log_line = log_line.clone();
            let id = id.to_string();
            std::thread::spawn(move || {
                use std::io::BufRead;
                for line in std::io::BufReader::new(pipe).lines() {
                    match line {
                        Ok(line) => log_line(&id, &line),
                        Err(_) => break,
                    }
                }
            });
        }
    }

    /// Stop a module process, giving it the grace period to shut down cleanly.
    /// A no-op if not running. Blocking: call it off the async runtime.
    pub fn stop(&self, id: &str) {
        let Some(mut p) = self.procs.write().unwrap().remove(id) else { return };
        ask_to_stop(id, &mut p.child);
        reap(id, &mut p.child, Instant::now() + STOP_GRACE);
        tracing::info!(module = %id, "stopped module process");
    }

    fn staged_manifest(
        &self,
        staging: &Path,
        expected_id: Option<&str>,
    ) -> anyhow::Result<(String, Value)> {
        let manifest: Value =
            serde_json::from_str(&std::fs::read_to_string(staging.join("module.json"))?)?;
        let id = manifest
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow::anyhow!("module.json has no id"))?
            .to_string();
        validate_id(&id)?;
        if let Some(expected) = expected_id {
            if expected != id {
                anyhow::bail!(
                    "bundle declares id '{id}' but it was offered as '{expected}'; refusing to install"
                );
            }
        }
        if self.cfg.reserved_ids.iter().any(|r| r == &id) {
            anyhow::bail!(
                "'{id}' is built into this server and can't be installed as a module (this build compiles it in)"
            );
        }
        let min_server = manifest.get("minServer").and_then(Value::as_str);
        if !kroma_module_manifest::server_satisfies(min_server, &self.cfg.server_version) {
            anyhow::bail!(
                "'{id}' requires KROMA server {} but this server is {}; update the server first",
                min_server.unwrap_or("?"),
                self.cfg.server_version,
            );
        }
        Ok((id, manifest))
    }

    /// Unpack a `.kmod` bundle under `<modules_dir>/<id>/` and spawn it,
    /// returning the module's manifest JSON.
    ///
    /// `expected_id` must be set whenever the bundle was chosen through a
    /// catalog: the id inside the bundle decides which directory is REPLACED,
    /// so without this a registry could advertise one id and ship a bundle that
    /// overwrites another — including a module the official registry owns.
    pub fn install(&self, bytes: &[u8], expected_id: Option<&str>) -> anyhow::Result<Value> {
        let tar_bytes = decompressed_tar(bytes)?;

        let staging = self.cfg.modules_dir.join(format!(".staging-{}", rand::random::<u32>()));
        std::fs::create_dir_all(&staging)?;
        let result = (|| {
            unpack_validated(&tar_bytes, &staging)?;
            let (id, manifest) = self.staged_manifest(&staging, expected_id)?;
            self.stop(&id);
            let dest = self.dir(&id);
            let _ = std::fs::remove_dir_all(&dest);
            std::fs::rename(&staging, &dest)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let bin = dest.join(MODULE_BIN);
                if bin.exists() {
                    std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755))?;
                }
            }
            // A "library" module ships no binary: its code is a leaf crate
            // co-linked into the processes that need it, so nothing to spawn.
            if self.has_binary(&id) {
                self.spawn(&id)?;
            } else {
                tracing::info!(module = %id, "library module installed (no binary to spawn)");
            }
            Ok::<Value, anyhow::Error>(manifest)
        })();
        let _ = std::fs::remove_dir_all(&staging);
        self.invalidate_manifests();
        result
    }

    /// Download a `.kmod` artifact, streaming byte progress to `on_progress`,
    /// and verify it against the published checksum before returning the bytes.
    /// A blank/absent `expected_sha256` skips verification (the caller decides
    /// whether that is acceptable; registry installs never allow it).
    pub async fn download_artifact(
        &self,
        url: &str,
        expected_sha256: Option<&str>,
        on_progress: FetchProgress<'_>,
    ) -> anyhow::Result<Vec<u8>> {
        let bytes =
            fetch_bounded(self.artifact_client(), url, MAX_BUNDLE_BYTES, Some(on_progress)).await?;
        if let Some(expected) = expected_sha256.map(str::trim).filter(|s| !s.is_empty()) {
            verify_sha256(&bytes, expected)?;
        }
        Ok(bytes)
    }

    /// Fetch and parse a registry catalog.
    ///
    /// A catalog URL is operator-supplied and may point at a third-party host,
    /// so the request is bounded on both axes: a total timeout (an unresponsive
    /// host must not hang the admin page) and a size cap read BEFORE parsing (a
    /// schema cannot reject bytes it has not read).
    ///
    /// The URL may also be a registry's WEBSITE rather than the JSON itself:
    /// when the body isn't JSON, a `<link rel="kroma-modules" href="…">` tag
    /// names the catalog (see [`discover`]), so an operator can paste
    /// `https://modules.example.com` and people clicking the same URL get a
    /// page.
    pub async fn fetch_catalog(&self, url: &str) -> anyhow::Result<Value> {
        if let Some((at, value)) = self.catalog_cache.read().unwrap().get(url) {
            if at.elapsed() < CATALOG_CACHE_TTL {
                return Ok(value.clone());
            }
        }
        let value = self.fetch_catalog_uncached(url).await?;
        let mut cache = self.catalog_cache.write().unwrap();
        cache.retain(|_, (at, _)| at.elapsed() < CATALOG_CACHE_TTL);
        cache.insert(url.to_string(), (std::time::Instant::now(), value.clone()));
        Ok(value)
    }

    async fn fetch_catalog_uncached(&self, url: &str) -> anyhow::Result<Value> {
        let body = fetch_bounded(self.catalog_client(), url, MAX_CATALOG_BYTES, None).await?;
        if let Ok(value) = serde_json::from_slice(&body) {
            return Ok(value);
        }
        let href = discover::catalog_href(&String::from_utf8_lossy(&body)).ok_or_else(|| {
            anyhow::anyhow!("not a catalog, and the page declares no kroma-modules link")
        })?;
        let base = reqwest::Url::parse(url)?;
        let resolved = base.join(&href)?;
        // The discovered link inherits the operator's trust in the SITE, not
        // more: it must be https, or stay on the exact origin the operator
        // typed (which also keeps the loopback URL the test harness points the
        // official slot at working).
        let same_origin = resolved.scheme() == base.scheme()
            && resolved.host() == base.host()
            && resolved.port_or_known_default() == base.port_or_known_default();
        if resolved.scheme() != "https" && !same_origin {
            anyhow::bail!("the page's kroma-modules link must be https (got '{resolved}')");
        }
        let body =
            fetch_bounded(self.catalog_client(), resolved.as_str(), MAX_CATALOG_BYTES, None)
                .await?;
        Ok(serde_json::from_slice(&body)?)
    }

    fn catalog_client(&self) -> &reqwest::Client {
        self.catalog_client.get_or_init(|| {
            reqwest::Client::builder()
                .timeout(CATALOG_TIMEOUT)
                .redirect(no_downgrade())
                .build()
                .unwrap_or_default()
        })
    }

    // https_only: the artifact produces an executable, and a redirect from https
    // to http would otherwise undo the caller's scheme check.
    fn artifact_client(&self) -> &reqwest::Client {
        self.artifact_client.get_or_init(|| {
            reqwest::Client::builder()
                .timeout(ARTIFACT_TIMEOUT)
                .https_only(true)
                .build()
                .unwrap_or_default()
        })
    }

    /// Sidecars are plain child processes that survive their parent, so a
    /// shutdown skipping this leaves orphans holding their ports.
    ///
    /// Every module is asked to stop first and only then waited on, so the whole
    /// shutdown costs one grace period rather than one per module. Blocking:
    /// call it off the async runtime.
    pub fn stop_all(&self) {
        let mut procs: Vec<(String, Proc)> = self.procs.write().unwrap().drain().collect();
        for (id, p) in &mut procs {
            ask_to_stop(id, &mut p.child);
        }
        let deadline = Instant::now() + STOP_GRACE;
        for (id, p) in &mut procs {
            reap(id, &mut p.child, deadline);
            tracing::info!(module = %id, "stopped module process");
        }
    }

    pub fn uninstall(&self, id: &str) -> anyhow::Result<()> {
        validate_id(id)?;
        self.stop(id);
        std::fs::remove_dir_all(self.dir(id))?;
        self.invalidate_manifests();
        Ok(())
    }

    /// Start one installed module, applying the same gates as boot: a stray
    /// `.kmod` for a built-in id never spawns (it would duplicate the in-core
    /// module), `minServer` is enforced, and a library module (no binary) is a
    /// successful no-op. This is what the admin enable toggle drives, so
    /// enabling a runtime module brings its process up without a restart.
    pub fn start_installed(&self, id: &str) -> anyhow::Result<()> {
        let manifest = self
            .installed_manifests()
            .into_iter()
            .find(|m| m.get("id").and_then(Value::as_str) == Some(id))
            .ok_or_else(|| anyhow::anyhow!("'{id}' is not installed"))?;
        if self.cfg.reserved_ids.iter().any(|r| r == id) {
            anyhow::bail!("'{id}' shadows a built-in module; not spawning");
        }
        let min_server = manifest.get("minServer").and_then(Value::as_str);
        if !kroma_module_manifest::server_satisfies(min_server, &self.cfg.server_version) {
            anyhow::bail!(
                "'{id}' requires KROMA server {} but this server is {}",
                min_server.unwrap_or("?"),
                self.cfg.server_version,
            );
        }
        if !self.has_binary(id) {
            return Ok(());
        }
        self.spawn(id)?;
        Ok(())
    }

    pub fn spawn_enabled(&self, host: &dyn HostCtx) {
        for manifest in self.installed_manifests() {
            let Some(id) = manifest.get("id").and_then(Value::as_str) else { continue };
            if !host.module_enabled(id) {
                continue;
            }
            if let Err(e) = self.start_installed(id) {
                tracing::warn!(module = %id, error = %format!("{e:#}"), "module not spawned");
            }
        }
    }
}

/// Verify `bytes` against a hex SHA-256. Refusing on mismatch is what keeps a
/// tampered or truncated registry download out of `install()`.
pub fn verify_sha256(bytes: &[u8], expected: &str) -> anyhow::Result<()> {
    use sha2::Digest;
    let actual = hex::encode(sha2::Sha256::digest(bytes));
    anyhow::ensure!(
        actual.eq_ignore_ascii_case(expected.trim()),
        "bundle checksum mismatch (expected {expected}, got {actual}); refusing to install"
    );
    Ok(())
}

/// How long a sidecar gets to run its `on_disable` hooks before it is killed
/// outright. A module that supervises a child of its own (the remote module's
/// `cloudflared`) needs this window to take it down; SIGKILL orphans it and the
/// tunnel keeps serving with nothing left to stop it.
const STOP_GRACE: Duration = Duration::from_secs(6);
const STOP_POLL: Duration = Duration::from_millis(25);

/// Ask a module process to exit cleanly. Unix only: elsewhere the process has no
/// shutdown path and [`reap`] kills it once the grace period lapses.
fn ask_to_stop(id: &str, child: &mut Child) {
    #[cfg(unix)]
    {
        let pid = child.id() as i32;
        // SAFETY: `child` has not been waited on, so `pid` is still our
        // un-reaped child and cannot have been recycled onto another process.
        let sent = unsafe { libc::kill(pid, libc::SIGTERM) };
        if sent != 0 {
            tracing::warn!(module = %id, pid, "SIGTERM failed; will kill");
        }
    }
    #[cfg(not(unix))]
    let _ = (id, child);
}

/// Wait for a stopping child until `deadline`, then kill it. Always reaps, so no
/// zombie is left behind.
fn reap(id: &str, child: &mut Child, deadline: Instant) {
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(STOP_POLL),
            Ok(None) => break,
            Err(_) => break,
        }
    }
    tracing::warn!(module = %id, "module did not stop in time; killing");
    let _ = child.kill();
    let _ = child.wait();
}

fn free_port() -> anyhow::Result<u16> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}

// A module id must be a safe directory name: it becomes `<modules>/<id>/`.
fn validate_id(id: &str) -> anyhow::Result<()> {
    let ok = !id.is_empty()
        && id.len() <= 128
        && id != "."
        && id != ".."
        && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    anyhow::ensure!(ok, "invalid module id {id:?}");
    Ok(())
}

// Keeps only `Normal` path components (dropping `..` and absolute prefixes) and
// only allow-listed bundle files: an entry path must never escape the install dir.
fn sanitized_entry(raw: &std::path::Path) -> Option<PathBuf> {
    use std::path::Component;
    let safe: PathBuf = raw
        .components()
        .filter_map(|c| match c {
            Component::Normal(p) => Some(p),
            _ => None,
        })
        .collect();
    if safe.as_os_str().is_empty() {
        return None;
    }
    let rel = safe.to_string_lossy().replace('\\', "/");
    let allowed = matches!(rel.as_ref(), "module.json" | "module" | "icon.svg" | "icon.png")
        || rel.starts_with("fe/");
    allowed.then_some(safe)
}

// `.kmod` is a zstd tar; gzip (legacy) and raw tar are also accepted,
// dispatched by magic bytes.
fn decompressed_tar(bytes: &[u8]) -> anyhow::Result<Cow<'_, [u8]>> {
    let mut out = Vec::new();
    if bytes.starts_with(&[0x28, 0xb5, 0x2f, 0xfd]) {
        std::io::Read::read_to_end(&mut ruzstd::StreamingDecoder::new(bytes)?, &mut out)?;
        return Ok(Cow::Owned(out));
    }
    if bytes.starts_with(&[0x1f, 0x8b]) {
        std::io::Read::read_to_end(&mut flate2::read::GzDecoder::new(bytes), &mut out)?;
        return Ok(Cow::Owned(out));
    }
    Ok(Cow::Borrowed(bytes))
}

fn unpack_validated(tar_bytes: &[u8], dest: &std::path::Path) -> anyhow::Result<()> {
    let mut archive = tar::Archive::new(tar_bytes);
    for entry in archive.entries()? {
        let mut entry = entry?;
        // Only ever write regular files: `sanitized_entry` rewrites an entry's
        // own path but not a link target, so a symlink passing the allow-list
        // would redirect a later write outside `dest`.
        if !entry.header().entry_type().is_file() {
            continue;
        }
        let raw = entry.path()?.into_owned();
        let Some(safe) = sanitized_entry(&raw) else { continue };
        let out = dest.join(&safe);
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent)?;
        }
        entry.unpack(&out)?;
    }
    Ok(())
}

const MAX_PROXY_BODY_BYTES: usize = 256 * 1024 * 1024;

/// Reverse-proxy `req` (its path already rewritten to the module-local path) to
/// a module process on `port`.
pub async fn proxy_to(port: u16, path_and_query: &str, req: Request) -> Response {
    let url = format!("http://127.0.0.1:{port}{path_and_query}");
    let (parts, body) = req.into_parts();
    // Mounted outside the core session gate and buffered before the target
    // module authenticates it, so an unbounded read is a pre-auth
    // memory-exhaustion DoS.
    let bytes = match axum::body::to_bytes(body, MAX_PROXY_BODY_BYTES).await {
        Ok(b) => b,
        Err(_) => return (StatusCode::PAYLOAD_TOO_LARGE, "body too large").into_response(),
    };
    // A total timeout so a wedged sidecar can't pin a proxied request open forever.
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    let mut out = client.request(parts.method, &url).body(bytes.to_vec());
    for (name, value) in &parts.headers {
        // Host header must not be forwarded verbatim to the upstream.
        if name != axum::http::header::HOST {
            out = out.header(name.as_str(), value.as_bytes());
        }
    }
    match out.send().await {
        Ok(resp) => {
            let status = resp.status();
            let headers = resp.headers().clone();
            let body = resp.bytes().await.unwrap_or_default();
            let mut builder = Response::builder().status(status);
            for (name, value) in &headers {
                builder = builder.header(name, value);
            }
            builder.body(Body::from(body)).unwrap_or_else(|_| {
                (StatusCode::BAD_GATEWAY, "bad upstream response").into_response()
            })
        }
        Err(e) => {
            tracing::warn!(port, error = %e, "module proxy failed");
            (StatusCode::BAD_GATEWAY, "module unavailable").into_response()
        }
    }
}

/// The `/_host/*` callback router modules call back into (mount under `/api`),
/// guarded by the shared `token`.
pub fn host_router<S>(token: String) -> Router<S>
where
    S: HostCtx + Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/_host/setting", get(get_setting::<S>))
        .route("/_host/settings", post(set_settings::<S>))
        .route("/_host/events", post(publish_event::<S>))
        .route("/_host/events_to", post(publish_event_to::<S>))
        .route("/_host/notify", post(notify::<S>))
        .route("/_host/job", post(trigger_job::<S>))
        .route("/_host/enabled", get(module_enabled::<S>))
        .route("/_host/libraries", get(library_folders::<S>))
        .route("/_host/tmdb", get(tmdb_config::<S>))
        .route_layer(from_fn_with_state(HostToken(token), require_host_token))
}

#[derive(serde::Deserialize)]
struct SettingQuery {
    key: String,
    kind: String,
    default: String,
}

async fn get_setting<S: HostCtx>(
    State(host): State<S>,
    axum::extract::Query(q): axum::extract::Query<SettingQuery>,
) -> Json<Value> {
    let value = match q.kind.as_str() {
        "bool" => json!(host.setting_bool(&q.key, q.default == "true")),
        "i64" => json!(host.setting_i64(&q.key, q.default.parse().unwrap_or(0))),
        _ => json!(host.setting_str(&q.key, &q.default)),
    };
    Json(json!({ "value": value }))
}

#[derive(serde::Deserialize)]
struct SettingsPatch {
    patch: std::collections::BTreeMap<String, Value>,
}

async fn set_settings<S: HostCtx>(State(host): State<S>, Json(body): Json<SettingsPatch>) -> StatusCode {
    host.set_settings(body.patch);
    StatusCode::NO_CONTENT
}

#[derive(serde::Deserialize)]
struct EventBody {
    topic: String,
    payload: Value,
}

async fn publish_event<S: HostCtx>(State(host): State<S>, Json(body): Json<EventBody>) -> StatusCode {
    host.publish(Event { topic: body.topic, payload: body.payload });
    StatusCode::NO_CONTENT
}

#[derive(serde::Deserialize)]
struct AddressedEventBody {
    #[serde(rename = "userId")]
    user_id: String,
    topic: String,
    payload: Value,
}

async fn publish_event_to<S: HostCtx>(
    State(host): State<S>,
    Json(body): Json<AddressedEventBody>,
) -> StatusCode {
    host.publish_to(&body.user_id, Event { topic: body.topic, payload: body.payload });
    StatusCode::NO_CONTENT
}

#[derive(serde::Deserialize)]
struct NotifyBody {
    audience: kroma_module_host::Audience,
    spec: kroma_module_host::NotificationSpec,
}

// The core owns audience resolution and preference filtering, so a module can't
// reach past a user's settings.
async fn notify<S: HostCtx>(State(host): State<S>, Json(body): Json<NotifyBody>) -> Json<Value> {
    let sent = host.notify(&body.audience, &body.spec);
    Json(json!({ "sent": sent }))
}

#[derive(serde::Deserialize)]
struct JobBody {
    key: String,
    reason: String,
}

async fn trigger_job<S: HostCtx>(State(host): State<S>, Json(body): Json<JobBody>) -> StatusCode {
    // The trait wants &'static str; job keys are a small fixed set, so the leak
    // is bounded.
    let key: &'static str = Box::leak(body.key.into_boxed_str());
    let reason: &'static str = Box::leak(body.reason.into_boxed_str());
    host.trigger_job(key, reason);
    StatusCode::NO_CONTENT
}

#[derive(serde::Deserialize)]
struct EnabledQuery {
    id: String,
}

async fn module_enabled<S: HostCtx>(
    State(host): State<S>,
    axum::extract::Query(q): axum::extract::Query<EnabledQuery>,
) -> Json<Value> {
    Json(json!({ "enabled": host.module_enabled(&q.id) }))
}

async fn library_folders<S: HostCtx>(State(host): State<S>) -> Json<Value> {
    Json(json!(host.library_folders()))
}

async fn tmdb_config<S: HostCtx>(State(host): State<S>) -> Json<Value> {
    Json(json!({ "key": host.tmdb_api_key(), "language": host.metadata_language() }))
}
