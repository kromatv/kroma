//! The core side of the out-of-process module system: spawns each installed
//! module's binary, reverse-proxies to it, and serves the `/api/_host/*` callback API.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, RwLock};

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
}

impl Supervisor {
    pub fn new(cfg: SupervisorConfig) -> Arc<Self> {
        Arc::new(Self {
            cfg,
            procs: RwLock::new(HashMap::new()),
            manifests_cache: RwLock::new(None),
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

    /// The port of the running module claiming the admin-route segment `seg`
    /// (via its manifest's `adminPrefixes`).
    pub fn admin_route_port(&self, seg: &str) -> Option<u16> {
        for m in self.installed_manifests() {
            let owns = m
                .get("adminPrefixes")
                .and_then(Value::as_array)
                .is_some_and(|a| a.iter().any(|p| p.as_str() == Some(seg)));
            if owns {
                if let Some(id) = m.get("id").and_then(Value::as_str) {
                    return self.port_of(id);
                }
            }
        }
        None
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

    /// Stop a module process (SIGKILL). A no-op if not running.
    pub fn stop(&self, id: &str) {
        if let Some(mut p) = self.procs.write().unwrap().remove(id) {
            let _ = p.child.kill();
            let _ = p.child.wait();
            tracing::info!(module = %id, "stopped module process");
        }
    }

    /// Unpack a `.kmod` bundle under `<modules_dir>/<id>/` and spawn it,
    /// returning the module's manifest JSON.
    pub fn install(&self, bytes: &[u8]) -> anyhow::Result<Value> {
        // `.kmod` is a zstd tar; gzip (legacy) and raw tar are also accepted,
        // dispatched by magic bytes.
        let mut decompressed = Vec::new();
        let tar_bytes: &[u8] = if bytes.starts_with(&[0x28, 0xb5, 0x2f, 0xfd]) {
            let mut dec = ruzstd::StreamingDecoder::new(bytes)?;
            std::io::Read::read_to_end(&mut dec, &mut decompressed)?;
            &decompressed
        } else if bytes.starts_with(&[0x1f, 0x8b]) {
            std::io::Read::read_to_end(
                &mut flate2::read::GzDecoder::new(bytes),
                &mut decompressed,
            )?;
            &decompressed
        } else {
            bytes
        };

        let staging = self.cfg.modules_dir.join(format!(".staging-{}", rand::random::<u32>()));
        std::fs::create_dir_all(&staging)?;
        let result = (|| {
            unpack_validated(tar_bytes, &staging)?;
            let manifest: Value =
                serde_json::from_str(&std::fs::read_to_string(staging.join("module.json"))?)?;
            let id = manifest
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| anyhow::anyhow!("module.json has no id"))?
                .to_string();
            validate_id(&id)?;
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

    /// Download a `.kmod` and install it. A direct URL with no published
    /// checksum still installs, but whenever `expected_sha256` is known the
    /// bytes must match it.
    pub async fn install_from_url(
        &self,
        url: &str,
        expected_sha256: Option<&str>,
    ) -> anyhow::Result<Value> {
        let bytes = reqwest::get(url).await?.error_for_status()?.bytes().await?;
        if let Some(expected) = expected_sha256.map(str::trim).filter(|s| !s.is_empty()) {
            verify_sha256(&bytes, expected)?;
        }
        self.install(&bytes)
    }

    pub async fn fetch_catalog(&self, url: &str) -> anyhow::Result<Value> {
        Ok(reqwest::get(url).await?.error_for_status()?.json().await?)
    }

    /// Sidecars are plain child processes that survive their parent, so a
    /// shutdown skipping this leaves orphans holding their ports.
    pub fn stop_all(&self) {
        let ids: Vec<String> = self.procs.read().unwrap().keys().cloned().collect();
        for id in ids {
            self.stop(&id);
        }
    }

    pub fn uninstall(&self, id: &str) -> anyhow::Result<()> {
        validate_id(id)?;
        self.stop(id);
        std::fs::remove_dir_all(self.dir(id))?;
        self.invalidate_manifests();
        Ok(())
    }

    pub fn spawn_enabled(&self, host: &dyn HostCtx) {
        for manifest in self.installed_manifests() {
            let Some(id) = manifest.get("id").and_then(Value::as_str) else { continue };
            // A stray `.kmod` for a built-in id must never spawn a process that
            // duplicates the in-core module.
            if self.cfg.reserved_ids.iter().any(|r| r == id) {
                tracing::warn!(module = %id, "installed module shadows a built-in; not spawning");
                continue;
            }
            let min_server = manifest.get("minServer").and_then(Value::as_str);
            if !kroma_module_manifest::server_satisfies(min_server, &self.cfg.server_version) {
                tracing::warn!(
                    module = %id,
                    requires = min_server.unwrap_or("?"),
                    server = %self.cfg.server_version,
                    "installed module requires a newer server; not spawning"
                );
                continue;
            }
            if !self.has_binary(id) {
                continue;
            }
            if host.module_enabled(id) {
                if let Err(e) = self.spawn(id) {
                    tracing::warn!(module = %id, error = %format!("{e:#}"), "module spawn failed");
                }
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
