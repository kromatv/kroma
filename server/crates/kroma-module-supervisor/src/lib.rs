//! The core side of the out-of-process module system: spawns each installed
//! module's binary, reverse-proxies to it, and serves the `/api/_host/*` callback API.


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
use kroma_module_manifest::ModuleManifest;
use kroma_module_host::{Event, HostCtx};
use serde_json::{json, Value};

mod adopt;

pub const MODULE_BIN: &str = "module";
/// A module's own database, beside the files its `.kmod` unpacked into.
pub const MODULE_STORE: &str = "module.sqlite";
/// Written beside a module at install time; not part of the `.kmod` itself.
const ORIGIN_FILE: &str = "origin.json";

/// Where an installed module came from.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Origin {
    /// `registry` | `upload` | `url` | `unknown`.
    pub kind: String,
    /// The catalog or artifact URL, when it came from one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Unix seconds.
    pub installed_at: u64,
    /// The binary's size and mtime AS INSTALLED. Compared against what is on
    /// disk to spot a local build; recorded rather than inferred from
    /// `installed_at` so restoring a backup (which rewrites mtimes wholesale)
    /// does not read as one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bin: Option<BinStamp>,
    /// The binary on disk is not the one installed: a dev loop swapped it, so
    /// this module is NOT running the artifact it was installed from.
    #[serde(default)]
    pub local_build: bool,
}

/// Identity of an installed binary, enough to notice it was replaced.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BinStamp {
    pub size: u64,
    /// Unix seconds.
    pub mtime: u64,
}

impl Origin {
    fn unknown() -> Self {
        Self { kind: "unknown".into(), url: None, installed_at: 0, bin: None, local_build: false }
    }
}

fn unix_secs(t: std::time::SystemTime) -> u64 {
    t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn stamp_of(path: &Path) -> Option<BinStamp> {
    let meta = std::fs::metadata(path).ok()?;
    Some(BinStamp { size: meta.len(), mtime: meta.modified().map(unix_secs).unwrap_or(0) })
}

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
    manifests_cache: RwLock<Option<Vec<ModuleManifest>>>,
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
// Fast enough that a rebuild feels immediate, slow enough to be free when idle.
const HOT_RELOAD_POLL: Duration = Duration::from_millis(400);

const WATCHDOG_POLL: Duration = Duration::from_secs(2);
const WATCHDOG_BACKOFF_MIN: Duration = Duration::from_secs(2);
const WATCHDOG_BACKOFF_MAX: Duration = Duration::from_secs(60);

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

    /// What `id` declared under `storage`, or `None` when it declared none -- in
    /// which case it holds no database capability at all.
    fn storage_of(&self, id: &str) -> Option<kroma_module_manifest::Storage> {
        self.installed_manifests().into_iter().find(|m| m.id == id).and_then(|m| m.storage)
    }

    /// Move any table `id` declared as its own out of the core database and into
    /// its own file, before the process that will read it starts. Best-effort:
    /// a failure leaves the rows in the core database and is logged, because a
    /// module that starts without its old rows is worse than one that starts late.
    fn adopt_declared_tables(&self, id: &str, storage: Option<&kroma_module_manifest::Storage>) {
        let Some(tables) = storage.map(|s| s.adopt.as_slice()).filter(|t| !t.is_empty()) else {
            return;
        };
        let store = self.dir(id).join(MODULE_STORE);
        let moved = kroma_db::init(&self.cfg.db_path)
            .and_then(|pool| pool.get())
            .and_then(|conn| adopt::adopt_tables(&conn, &store, tables));
        match moved {
            Ok(0) => {}
            Ok(n) => self.say(id, &format!("INFO moved {n} table(s) into this module's own database")),
            Err(error) => {
                tracing::error!(module = %id, error = %format!("{error:#}"), "table adoption failed");
                self.say(id, "ERROR could not move this module's tables out of the core database");
            }
        }
    }

    /// A lifecycle line in the module's OWN log stream. `tracing` would file it
    /// under the core, where nobody looking at that module would find it: a
    /// restart has to read as one story next to the sidecar's own output.
    fn say(&self, id: &str, line: &str) {
        if let Some(log_line) = &self.cfg.log_line {
            log_line(id, line);
        }
    }

    /// Whether this module ships a sidecar binary at all. A library module (the
    /// scene parser, the download sub-engines) is code co-linked into another
    /// process, so it HAS no process: "not running" is its normal state, not a
    /// fault, and nothing should report it as one.
    pub fn has_binary(&self, id: &str) -> bool {
        self.dir(id).join(MODULE_BIN).exists()
    }

    /// Every installed module's `module.json`, cached until the next install or
    /// uninstall. One that does not parse is logged with its directory and left
    /// out, so a reader downstream never has to ask whether a field is there.
    pub fn installed_manifests(&self) -> Vec<ModuleManifest> {
        if let Some(cached) = self.manifests_cache.read().unwrap().clone() {
            return cached;
        }
        let scanned = self.scan_manifests();
        *self.manifests_cache.write().unwrap() = Some(scanned.clone());
        scanned
    }

    fn scan_manifests(&self) -> Vec<ModuleManifest> {
        let Ok(entries) = std::fs::read_dir(&self.cfg.modules_dir) else {
            return Vec::new();
        };
        entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .filter_map(|e| {
                let dir = e.path();
                let text = std::fs::read_to_string(dir.join("module.json")).ok()?;
                match serde_json::from_str::<ModuleManifest>(&text) {
                    Ok(manifest) => Some(manifest),
                    Err(error) => {
                        tracing::warn!(
                            dir = %dir.display(),
                            %error,
                            "module.json is not a manifest; that module is ignored",
                        );
                        None
                    }
                }
            })
            .collect()
    }

    fn invalidate_manifests(&self) {
        *self.manifests_cache.write().unwrap() = None;
    }

    /// The ids of every runtime-installed (`.kmod`) module — not the ones
    /// compiled into this server.
    pub fn installed_ids(&self) -> Vec<String> {
        self.installed_manifests().into_iter().map(|m| m.id)
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

    /// Where an installed module came from, and whether its binary has been
    /// swapped since. Read from the `origin.json` written at install time;
    /// modules installed before that existed report `Origin::unknown()`.
    pub fn origin(&self, id: &str) -> Origin {
        let dir = self.dir(id);
        let mut origin = std::fs::read_to_string(dir.join(ORIGIN_FILE))
            .ok()
            .and_then(|s| serde_json::from_str::<Origin>(&s).ok())
            .unwrap_or_else(Origin::unknown);
        // A binary that is not the one recorded at install is one a dev loop
        // swapped in, so the process is not running the artifact this module was
        // installed from.
        if let (Some(installed), Some(current)) =
            (origin.bin.clone(), stamp_of(&dir.join(MODULE_BIN)))
        {
            origin.local_build = current != installed;
        }
        origin
    }

    fn write_origin(&self, id: &str, kind: &str, url: Option<&str>) {
        let origin = Origin {
            kind: kind.to_string(),
            url: url.map(str::to_string),
            installed_at: unix_secs(std::time::SystemTime::now()),
            bin: stamp_of(&self.dir(id).join(MODULE_BIN)),
            local_build: false,
        };
        if let Ok(body) = serde_json::to_string(&origin) {
            let _ = std::fs::write(self.dir(id).join(ORIGIN_FILE), body);
        }
    }

    pub fn port_of(&self, id: &str) -> Option<u16> {
        self.procs.read().unwrap().get(id).map(|p| p.port)
    }

    /// `(base_url, auth_token)` of the running module that serves the `port`
    /// contract, found by reading every installed manifest's `ports`. Resolved
    /// per call, so a provider that was just installed, restarted, or moved to
    /// a different localhost port is picked up with nothing re-wired, and no
    /// caller anywhere names a module id.
    ///
    /// A manifest that declares the contract but whose module is not running is
    /// passed over rather than resolved to, so a second provider still answers.
    pub fn port_endpoint(&self, port: &str) -> Option<(String, String)> {
        self.installed_manifests().into_iter().find_map(|m| {
            if !m.ports.iter().any(|p| p == port) {
                return None;
            }
            let live = self.port_of(&m.id)?;
            Some((format!("http://127.0.0.1:{live}"), self.cfg.host_token.clone()))
        })
    }

    pub fn host_token(&self) -> &str {
        &self.cfg.host_token
    }

    /// Drop the bookkeeping for any module whose process has exited, saying so
    /// on that module's own log, and answer with the ids that had died.
    ///
    /// Nothing else notices: a sidecar that exits keeps its entry here, which
    /// made [`spawn`](Self::spawn) a silent no-op ("already running") and left
    /// the module unreachable until the whole server was restarted.
    pub fn reap_exited(&self) -> Vec<String> {
        let mut dead = Vec::new();
        let mut procs = self.procs.write().unwrap();
        procs.retain(|id, p| match p.child.try_wait() {
            Ok(Some(status)) => {
                dead.push(id.clone());
                tracing::error!(module = %id, %status, "module process exited on its own");
                false
            }
            // Still running, or the status could not be read (leave it alone
            // rather than tear down a module over a transient wait error).
            _ => true,
        });
        drop(procs);
        for id in &dead {
            self.say(id, "ERROR module process exited");
        }
        dead
    }

    /// Spawn a module process on a free localhost port; a no-op if already
    /// running, an error if the module ships no binary.
    pub fn spawn(&self, id: &str) -> anyhow::Result<u16> {
        // Before the already-running shortcut: an entry whose process is gone
        // would otherwise answer "running" forever.
        self.reap_exited();
        if let Some(p) = self.procs.read().unwrap().get(id) {
            return Ok(p.port);
        }
        let bin = self.dir(id).join(MODULE_BIN);
        if !bin.exists() {
            anyhow::bail!("module binary missing: {}", bin.display());
        }
        let port = free_port()?;
        let storage = self.storage_of(id);
        self.adopt_declared_tables(id, storage.as_ref());
        let piped = self.cfg.log_line.is_some();
        let stdio = || if piped { Stdio::piped() } else { Stdio::inherit() };
        let mut child = Command::new(&bin)
            .env("KROMA_MODULE_ID", id)
            .env("KROMA_MODULE_PORT", port.to_string())
            .env("KROMA_CORE_URL", &self.cfg.core_url)
            .env("KROMA_HOST_TOKEN", &self.cfg.host_token)
            .env("KROMA_DB_PATH", &self.cfg.db_path)
            .env("KROMA_DATA_DIR", &self.cfg.data_dir)
            // What the module may reach in the CORE database, as its manifest
            // declared it. A module that declared nothing gets an empty grant
            // rather than no variable, so the sidecar can tell "denied
            // everything" from "an older host that sent no grant at all".
            .env("KROMA_MODULE_GRANT", grant_json(storage.as_ref()))
            .stdout(stdio())
            .stderr(stdio())
            .spawn()?;
        if let Some(log_line) = &self.cfg.log_line {
            Self::drain_logs(&mut child, id, log_line);
        }
        self.say(id, &format!("INFO starting module process on port {port}"));
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
        self.say(id, "INFO stopping module process");
        ask_to_stop(id, &mut p.child);
        reap(id, &mut p.child, Instant::now() + STOP_GRACE);
        self.say(id, "INFO module process stopped");
        tracing::info!(module = %id, "stopped module process");
    }

    fn staged_manifest(
        &self,
        staging: &Path,
        expected_id: Option<&str>,
    ) -> anyhow::Result<(String, ModuleManifest)> {
        let manifest: ModuleManifest =
            serde_json::from_str(&std::fs::read_to_string(staging.join("module.json"))?)?;
        let id = manifest.id.clone();
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
        // After the id checks, which are the security ones: a bundle shipped
        // under someone else's id must be reported as that, whatever contract it
        // was built against.
        check_manifest_schema(&id, &manifest)?;
        kroma_module_manifest::engines_satisfied(&manifest.engines, &self.cfg.server_version)
            .map_err(|reason| anyhow::anyhow!("'{id}' {reason}"))?;
        Ok((id, manifest))
    }

    /// Unpack a `.kmod` bundle under `<modules_dir>/<id>/` and spawn it,
    /// returning the module's manifest JSON.
    ///
    /// `expected_id` must be set whenever the bundle was chosen through a
    /// catalog: the id inside the bundle decides which directory is REPLACED,
    /// so without this a registry could advertise one id and ship a bundle that
    /// overwrites another — including a module the official registry owns.
    /// Unpack and spawn a `.kmod`. `origin` says where it came from
    /// (`registry` / `upload` / `url`) and is recorded beside the module so the
    /// admin page can show it.
    pub fn install(
        &self,
        bytes: &[u8],
        expected_id: Option<&str>,
        origin: (&str, Option<&str>),
    ) -> anyhow::Result<ModuleManifest> {
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
            self.write_origin(&id, origin.0, origin.1);
            if self.has_binary(&id) {
                self.spawn(&id)?;
            } else {
                tracing::info!(module = %id, "library module installed (no binary to spawn)");
            }
            Ok::<ModuleManifest, anyhow::Error>(manifest)
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
    /// The URL may be a document or a registry's ROOT: a contract with a
    /// well-known path does not need the site to say where its documents are,
    /// so anything not ending in `.json` gets [`DESCRIPTOR_PATH`] appended. That
    /// is also why nothing here reads HTML - the page an operator pastes is
    /// attacker-controlled, and parsing it to find a URL to fetch was a trust
    /// boundary the contract removed the need for.
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
        let target = registry_document_url(url);
        let body = fetch_bounded(self.catalog_client(), &target, MAX_CATALOG_BYTES, None).await?;
        serde_json::from_slice(&body)
            .map_err(|e| anyhow::anyhow!("{target} is not a registry document: {e}"))
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
    /// module), its `engines` are enforced, and a library module (no binary) is a
    /// successful no-op. This is what the admin enable toggle drives, so
    /// enabling a runtime module brings its process up without a restart.
    pub fn start_installed(&self, id: &str) -> anyhow::Result<()> {
        let manifest = self
            .installed_manifests()
            .into_iter()
            .find(|m| m.id == id)
            .ok_or_else(|| anyhow::anyhow!("'{id}' is not installed"))?;
        if self.cfg.reserved_ids.iter().any(|r| r == id) {
            anyhow::bail!("'{id}' shadows a built-in module; not spawning");
        }
        check_manifest_schema(id, &manifest)?;
        kroma_module_manifest::engines_satisfied(&manifest.engines, &self.cfg.server_version)
            .map_err(|reason| anyhow::anyhow!("'{id}' {reason}"))?;
        if !self.has_binary(id) {
            return Ok(());
        }
        self.spawn(id)?;
        Ok(())
    }

    /// Watch every running module's binary and restart the ones that change.
    ///
    /// This is the module half of `cargo watch`: a dev loop rebuilds a sidecar
    /// and drops the binary in, and the process running the old code is swapped
    /// for one running the new. Off unless `KROMA_MODULE_HOT_RELOAD=1`, so a
    /// production server never polls the filesystem for this.
    pub fn spawn_hot_reload(self: &Arc<Self>) {
        if std::env::var("KROMA_MODULE_HOT_RELOAD").as_deref() != Ok("1") {
            return;
        }
        let this = self.clone();
        tracing::info!("module hot reload armed: a changed sidecar binary restarts its process");
        std::thread::spawn(move || {
            let mut seen: HashMap<String, std::time::SystemTime> = HashMap::new();
            // A restart that fails takes the module out of `procs`, so watching
            // only what is running would drop it from the loop and leave it dead
            // and silent until the server itself restarted. It stays here until
            // it comes back.
            let mut down: std::collections::HashSet<String> = std::collections::HashSet::new();
            loop {
                std::thread::sleep(HOT_RELOAD_POLL);
                this.retry_failed_reloads(&mut down);
                for id in this.running_ids() {
                    this.reload_if_changed(&id, &mut seen, &mut down);
                }
            }
        });
    }

    /// The ids with a live entry in the process map. Bound in its own statement
    /// so the read guard is DROPPED before the caller acts: held across a
    /// restart it would deadlock against `stop`'s write lock.
    fn running_ids(&self) -> Vec<String> {
        self.procs.read().unwrap().keys().cloned().collect()
    }

    // Modules whose last restart failed, tried again. One stays in `down` until
    // it comes back, so a broken build is retried rather than forgotten.
    fn retry_failed_reloads(&self, down: &mut std::collections::HashSet<String>) {
        for id in std::mem::take(down) {
            match self.start_installed(&id) {
                Ok(_) => self.say(&id, "INFO sidecar back up after a failed hot reload"),
                Err(e) => {
                    self.say(&id, &format!("ERROR sidecar still down: {e:#}"));
                    down.insert(id);
                }
            }
        }
    }

    // Restart one module if its binary is not the one it started with. The first
    // sighting only records the stamp: that IS the binary already running.
    fn reload_if_changed(
        &self,
        id: &str,
        seen: &mut HashMap<String, std::time::SystemTime>,
        down: &mut std::collections::HashSet<String>,
    ) {
        let Ok(stamp) =
            std::fs::metadata(self.dir(id).join(MODULE_BIN)).and_then(|m| m.modified())
        else {
            return;
        };
        let changed = matches!(seen.get(id), Some(&last) if last != stamp);
        seen.insert(id.to_string(), stamp);
        if !changed {
            return;
        }
        tracing::info!(module = %id, "binary changed; restarting the sidecar");
        self.stop(id);
        if let Err(e) = self.start_installed(id) {
            tracing::error!(
                module = %id,
                error = %format!("{e:#}"),
                "hot reload failed; retrying every poll",
            );
            self.say(id, &format!("ERROR hot reload failed: {e:#}"));
            down.insert(id.to_string());
        }
    }

    /// Watch the running sidecars and bring back any that exits. A module that
    /// dies takes its whole feature with it (a dead acquisition sidecar is a
    /// request page that answers "this feature is disabled"), and until this
    /// existed it did so without a word and stayed down until the next restart.
    ///
    /// Backs off on a module that will not stay up, so a crash loop costs one
    /// line a minute rather than a spin.
    pub fn spawn_watchdog(self: &Arc<Self>) {
        let this = self.clone();
        std::thread::spawn(move || {
            let mut backoff: HashMap<String, Duration> = HashMap::new();
            let mut due: HashMap<String, Instant> = HashMap::new();
            loop {
                std::thread::sleep(WATCHDOG_POLL);
                for id in this.reap_exited() {
                    let wait = backoff.get(&id).copied().unwrap_or(WATCHDOG_POLL);
                    due.insert(id, Instant::now() + wait);
                }
                let ready: Vec<String> = due
                    .iter()
                    .filter(|(_, at)| Instant::now() >= **at)
                    .map(|(id, _)| id.clone())
                    .collect();
                for id in ready {
                    due.remove(&id);
                    match this.start_installed(&id) {
                        Ok(_) => {
                            backoff.remove(&id);
                            this.say(&id, "INFO module process restarted after an exit");
                        }
                        Err(e) => {
                            let next = backoff
                                .get(&id)
                                .map_or(WATCHDOG_BACKOFF_MIN, |d| (*d * 2).min(WATCHDOG_BACKOFF_MAX));
                            backoff.insert(id.clone(), next);
                            due.insert(id.clone(), Instant::now() + next);
                            tracing::error!(
                                module = %id,
                                error = %format!("{e:#}"),
                                retry_in_s = next.as_secs(),
                                "module restart failed",
                            );
                            this.say(&id, &format!("ERROR restart failed: {e:#}"));
                        }
                    }
                }
            }
        });
    }

    pub fn spawn_enabled(&self, host: &dyn HostCtx) {
        for manifest in self.installed_manifests() {
            let id = manifest.id.as_str();
            if !host.module_enabled(id) {
                continue;
            }
            if let Err(e) = self.start_installed(id) {
                tracing::error!(module = %id, error = %format!("{e:#}"), "module not spawned");
                // Also on the module's own channel: a module that never came up
                // is the first thing looked for in Admin > Journaux, and the core
                // log is not where it is looked for.
                self.say(id, &format!("ERROR module did not start: {e:#}"));
            }
        }
    }
}

/// Verify `bytes` against a hex SHA-256. Refusing on mismatch is what keeps a
/// tampered or truncated registry download out of `install()`.
/// `Err` when a bundle was built against a manifest contract this server does not
/// speak. Checked at install AND at spawn: an installed module predates the
/// server it now runs under, and the fields that moved parse as absent rather
/// than as errors, so reading one on a best-effort basis loses its dependencies
/// silently instead of saying why.
fn check_manifest_schema(id: &str, manifest: &ModuleManifest) -> anyhow::Result<()> {
    let found = manifest.schema_version;
    anyhow::ensure!(
        found == kroma_module_manifest::MODULE_SCHEMA_VERSION,
        "'{id}' was built for manifest schema v{found}, and this server speaks v{}; rebuild it against \
         the current SDK",
        kroma_module_manifest::MODULE_SCHEMA_VERSION,
    );
    Ok(())
}

/// The document at a registry ROOT. Named once because the operator's setting,
/// the sibling lookup and the error messages must all agree on it.
pub const DESCRIPTOR_PATH: &str = "registry.json";

/// The document an operator's registry URL names: itself when it already points
/// at one, else the descriptor at the well-known path beneath it.
pub fn registry_document_url(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    if trimmed.rsplit('/').next().is_some_and(|last| last.ends_with(".json")) {
        return trimmed.to_string();
    }
    format!("{trimmed}/{DESCRIPTOR_PATH}")
}

/// Resolve `relative` against the URL a document was actually fetched from, so a
/// sibling document (a registry's index beside its descriptor) is reached
/// without trusting a URL that document declares about itself.
pub fn sibling_url(fetched_from: &str, relative: &str) -> anyhow::Result<String> {
    Ok(reqwest::Url::parse(fetched_from)?.join(relative)?.to_string())
}

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
        // Authentication, so a sidecar resolves the caller of one of its routes
        // without reading the `sessions` table -- the last thing that made a
        // module with no storage of its own open a database.
        .route("/_host/session", post(session_user::<S>))
        // How a module reaches a peer: it asks for a CONTRACT and the core
        // answers with whoever serves it. No module id crosses this wire.
        .route("/_host/port", get(port_endpoint::<S>))
        .route_layer(from_fn_with_state(HostToken(token), require_host_token))
}

#[derive(serde::Deserialize)]
struct SessionBody {
    token: String,
}

// The whole `User`, not a bare id: the sidecar gates on permissions and
// localizes for the account, and a second round-trip for each would be silly.
//
// On a blocking thread, unlike its neighbours here: resolving a session is an
// indexed read of a real database, and every authenticated request a sidecar
// serves arrives through this one.
// A POST, unlike its neighbours here, because the argument is a live session
// token: a query string is the one place a secret reliably ends up in a log.
async fn session_user<S: HostCtx + Clone>(
    State(host): State<S>,
    Json(body): Json<SessionBody>,
) -> Json<Option<kroma_domain::User>> {
    Json(tokio::task::spawn_blocking(move || host.session_user(&body.token)).await.ok().flatten())
}

/// A module's core-database grant on the wire, as `kroma-db` reads it back.
/// Serialization cannot fail for this shape; an empty grant is the fallback and
/// also the answer for a module that declared no storage.
fn grant_json(storage: Option<&kroma_module_manifest::Storage>) -> String {
    storage
        .map(|s| serde_json::json!({ "read": s.core.read, "write": s.core.write }))
        .and_then(|v| serde_json::to_string(&v).ok())
        .unwrap_or_else(|| "{}".to_string())
}

#[derive(serde::Deserialize)]
struct PortQuery {
    port: String,
}

async fn port_endpoint<S: HostCtx>(
    State(host): State<S>,
    axum::extract::Query(q): axum::extract::Query<PortQuery>,
) -> Json<Value> {
    match host.port_endpoint(&q.port) {
        Some((base, token)) => Json(json!({ "base": base, "token": token })),
        None => Json(Value::Null),
    }
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

#[cfg(test)]
mod tests {
    use super::{grant_json, registry_document_url};

    #[test]
    fn a_registry_root_resolves_to_the_descriptor_at_the_well_known_path() {
        for root in [
            "https://mods.example.com",
            "https://mods.example.com/",
            "  https://mods.example.com  ",
        ] {
            assert_eq!(registry_document_url(root), "https://mods.example.com/registry.json");
        }
        // A registry hosted under a subpath is a root like any other.
        assert_eq!(
            registry_document_url("https://example.com/kroma/"),
            "https://example.com/kroma/registry.json",
        );
    }

    #[test]
    fn a_url_that_already_names_a_document_is_left_alone() {
        for doc in [
            "https://mods.example.com/registry.json",
            "https://mods.example.com/index.json",
            "https://mods.example.com/m/tv.kroma.torrents.json",
        ] {
            assert_eq!(registry_document_url(doc), doc);
        }
    }

    #[test]
    fn the_grant_a_module_is_spawned_with_is_the_one_its_manifest_declares() {
        // The last link in the chain: manifest -> this JSON -> the env the
        // sidecar reads -> the authorizer. If the shape drifted here, every
        // module would come up with a grant that silently is not its own, and
        // the only symptom would be denials somewhere else entirely.
        let storage = kroma_module_manifest::Storage {
            core: kroma_module_manifest::CoreScope {
                read: vec!["requests".into(), "users.username".into()],
                write: vec!["wanted".into()],
            },
            adopt: vec!["indexers".into()],
        };
        let json = grant_json(Some(&storage));
        let back: kroma_db::Grant = serde_json::from_str(&json).expect("kroma-db reads it back");
        assert_eq!(back.read, ["requests", "users.username"]);
        assert_eq!(back.write, ["wanted"]);
    }

    #[test]
    fn a_module_that_declared_no_storage_is_spawned_with_an_empty_grant() {
        // Not "no variable": the sidecar has to be able to tell "denied
        // everything" from an older host that sent nothing at all.
        let json = grant_json(None);
        assert_eq!(serde_json::from_str::<kroma_db::Grant>(&json).unwrap(), kroma_db::Grant::none());

        // ...and the same for a module that declared storage but no core reach,
        // which is the one that gets its own file and nothing else.
        let private_only = kroma_module_manifest::Storage::default();
        let json = grant_json(Some(&private_only));
        assert_eq!(serde_json::from_str::<kroma_db::Grant>(&json).unwrap(), kroma_db::Grant::none());
    }
}
