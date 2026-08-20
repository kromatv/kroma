//! The core side of the out-of-process module system: spawns each installed
//! module's binary, reverse-proxies to it, and serves the `/api/_host/*` callback API.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use kroma_module_manifest::ModuleManifest;
use serde_json::Value;

mod adopt;
mod host_api;
mod install;
mod manifests;
mod origin;
mod process;
mod proxy;
mod registry;
mod watch;

pub use host_api::host_router;
pub use origin::{BinStamp, Origin};
pub use proxy::proxy_to;
pub use registry::{
    sibling_url, verify_sha256, DESCRIPTOR_PATH, FetchProgress, MAX_BUNDLE_BYTES,
};

use manifests::{check_manifest_schema, grant_json};
use process::Proc;

pub const MODULE_BIN: &str = "module";
/// A module's own database, beside the files its `.kmod` unpacked into.
pub const MODULE_STORE: &str = "module.sqlite";
/// Names the directory an install unpacks into before it replaces the module's.
const STAGING_PREFIX: &str = ".staging-";

/// Where a module's own log lines go, as `(module_id, line)`. `None` leaves the
/// sidecar's stdout and stderr inherited by the core process.
pub type LogSink = Arc<dyn Fn(&str, &str) + Send + Sync>;

#[derive(Clone)]
pub struct SupervisorConfig {
    pub modules_dir: PathBuf,
    pub core_url: String,
    pub host_token: String,
    pub db_path: PathBuf,
    pub data_dir: PathBuf,
    pub reserved_ids: Vec<String>,
    pub server_version: String,
    pub log_line: Option<LogSink>,
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
}
