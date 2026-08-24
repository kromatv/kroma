//! The core side of the out-of-process module system: spawns each installed
//! module's binary, reverse-proxies to it, and serves the `/api/_host/*` callback API.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use kroma_module_host::Contribution;
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
pub use registry::{sibling_url, verify_sha256, FetchProgress, DESCRIPTOR_PATH, MAX_BUNDLE_BYTES};

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
        let Some(tables) = storage
            .map(|s| s.adopt.as_slice())
            .filter(|t| !t.is_empty())
        else {
            return;
        };
        let store = self.dir(id).join(MODULE_STORE);
        let moved = kroma_db::init(&self.cfg.db_path)
            .and_then(|pool| pool.get())
            .and_then(|conn| adopt::adopt_tables(&conn, &store, tables));
        match moved {
            Ok(0) => {}
            Ok(n) => self.say(
                id,
                &format!("INFO moved {n} table(s) into this module's own database"),
            ),
            Err(error) => {
                tracing::error!(module = %id, error = %format!("{error:#}"), "table adoption failed");
                self.say(
                    id,
                    "ERROR could not move this module's tables out of the core database",
                );
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

    /// Every running module that contributes `point`, found by reading the
    /// installed manifests. Resolved per call, so a contributor that was just
    /// installed, restarted, or moved to a different localhost port is picked up
    /// with nothing re-wired, and no caller anywhere names a module id.
    ///
    /// A manifest that declares the point but whose module is not running is
    /// passed over rather than answered with, so a second contributor still
    /// answers. ONE declaration is read now, not two: a `contributes` entry
    /// carries the instance name when the point takes several and `None` when it
    /// takes one, so a module can no longer say the same thing twice.
    ///
    /// A contribution built against a different MAJOR than the definer serves is
    /// skipped, and said so on that module's own log, rather than resolved to and
    /// failing a request an hour later. The definer is found from the point's own
    /// name, which is why a point carries one.
    pub fn contributions(&self, point: &str) -> Vec<Contribution> {
        let installed = self.installed_manifests();
        let defined_at = point_major(&installed, point);
        let mut out = Vec::new();
        for m in &installed {
            let answers: Vec<&kroma_module_manifest::Contribution> =
                m.contributes.iter().filter(|c| c.point == point).collect();
            if answers.is_empty() {
                continue;
            }
            let Some(live) = self.port_of(&m.id) else {
                continue;
            };
            let base = format!("http://127.0.0.1:{live}");
            for answer in answers {
                if defined_at.is_some_and(|major| answer.version != major) {
                    self.say(
                        &m.id,
                        &format!(
                            "ERROR answers {point} at v{} but it is defined at v{}; not resolved",
                            answer.version,
                            defined_at.unwrap_or(0)
                        ),
                    );
                    continue;
                }
                out.push(Contribution {
                    module_id: m.id.clone(),
                    instance: answer.id.clone(),
                    base_url: base.clone(),
                    token: self.cfg.host_token.clone(),
                });
            }
        }
        out
    }

    pub fn host_token(&self) -> &str {
        &self.cfg.host_token
    }
}

/// The major the module that DEFINES `point` serves, or `None` when no installed
/// manifest defines it — in which case a contribution's version has nothing to be
/// checked against and is taken as given. A bare name (no `/`) is one of the
/// handful the CORE calls, which no manifest defines.
fn point_major(installed: &[ModuleManifest], point: &str) -> Option<u32> {
    let (definer, local) = point.split_once('/')?;
    installed
        .iter()
        .find(|m| m.id == definer)?
        .defines_points
        .iter()
        .find(|d| d.name == local)
        .map(|d| d.version)
}
