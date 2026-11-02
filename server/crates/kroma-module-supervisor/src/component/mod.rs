//! A module, which ships as a WebAssembly component: it runs inside the server, is
//! reached on a socket of its own, and everything it asks of the outside is ruled
//! here on its behalf.

mod database;
mod files;
mod lan;
mod outside;
mod pool;
mod programs;
mod roots;

pub(crate) use pool::Pool;
use pool::{answer, tick_forever};
pub use roots::MediaRoots;

use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::Context;
use kroma_http::egress::Gateway;
use kroma_module_manifest::{ComponentNeeds, FsRoot, ModuleManifest};
use kroma_wasm_host::{Limits, Readied, WasmHost};
use sha2::Digest;
use tokio::net::{TcpListener, UnixListener};
use tokio::sync::Semaphore;

use super::gateway::{ModulePolicy, Running};
use super::lifecycle::Proc;
use super::{Endpoint, Supervisor, MODULE_COMPONENT};

const DEFAULT_MEMORY_MIB: u32 = 512;
const DEFAULT_CPU_SECONDS: u32 = 60;
const MAX_INSTANCES: u32 = 16;
const CORE_DATABASE: &str = "/kroma/core.sqlite";
const COMPILED_COPY: &str = "module.cwasm";
const LOG_FILTERS: [&str; 2] = ["KROMA_MODULE_LOG", "RUST_LOG"];

fn limits_of(needs: ComponentNeeds) -> Limits {
    Limits {
        memory_bytes: needs.memory_mib.unwrap_or(DEFAULT_MEMORY_MIB) as usize * 1024 * 1024,
        cpu_budget: Duration::from_secs(u64::from(needs.cpu_seconds.unwrap_or(DEFAULT_CPU_SECONDS))),
    }
}

impl Supervisor {
    fn wasm_host(&self) -> anyhow::Result<&WasmHost> {
        if let Some(host) = self.wasm.get() {
            return Ok(host);
        }
        let host = WasmHost::new().context("start the component host")?;
        Ok(self.wasm.get_or_init(|| host))
    }

    /// Serve an installed component on the module's socket.
    pub(crate) fn spawn_component(&self, id: &str) -> anyhow::Result<Endpoint> {
        let wiring = self
            .gateway
            .get()
            .ok_or_else(|| anyhow::anyhow!("'{id}' is a component, and no gateway is running"))?;
        let started = Instant::now();
        let wasm = std::fs::read(self.dir(id).join(MODULE_COMPONENT))
            .with_context(|| format!("read '{id}'s component"))?;
        let helpers_dir = self.cfg.data_dir.join(programs::HELPERS_DIR).join(id);
        let key = hex::encode(sha2::Sha256::digest(&wasm));
        let (component, readied) = self
            .wasm_host()?
            .compile_keeping(&wasm, &helpers_dir.join(COMPILED_COPY), &key)
            .map_err(|error| anyhow::anyhow!("compile '{id}': {error}"))?;
        let manifest: ModuleManifest = self
            .manifest_on_disk(id)
            .ok_or_else(|| anyhow::anyhow!("'{id}' has no readable manifest"))?;
        let first_party = self.origin(id).official;
        let no_network = manifest.permissions.is_none();
        let token = self.module_token(id);
        let policy = Arc::new(ModulePolicy {
            module: id.to_string(),
            token: token.clone(),
            network: wiring.network.0.clone(),
            no_network,
        });
        let _entered = wiring.runtime.enter();
        let tcp = std::net::TcpListener::bind(("127.0.0.1", 0))?;
        tcp.set_nonblocking(true)?;
        let address = tcp.local_addr()?.to_string();
        let mut tasks = vec![wiring
            .runtime
            .spawn(kroma_egress::serve_tcp(TcpListener::from_std(tcp)?, policy))
            .abort_handle()];

        let endpoint = self.assign_endpoint(id)?;
        let listener = UnixListener::from_std({
            let listener = std::os::unix::net::UnixListener::bind(&endpoint.socket)?;
            listener.set_nonblocking(true)?;
            listener
        })?;
        let say = {
            let log_line = self.cfg.log_line.clone();
            let id = id.to_string();
            Arc::new(move |line: &str| {
                if let Some(log_line) = &log_line {
                    log_line(&id, line);
                }
            })
        };
        let storage = manifest.storage.clone();
        self.adopt_declared_tables(id, storage.as_ref());
        let gateway = Gateway {
            address,
            credential: token.clone(),
        };
        let roots = self.component_roots(id, &manifest, first_party, wiring.media())?;
        let media = manifest
            .permissions
            .as_ref()
            .is_some_and(|p| {
                p.fs.read.contains(&FsRoot::Media) || p.fs.write.contains(&FsRoot::Media)
            })
            .then(|| (wiring.media())());
        let databases = storage.map(|storage| {
            Arc::new(database::ModuleDatabases::new(
                id,
                self.cfg.db_path.clone(),
                CORE_DATABASE,
                self.dir(id),
                kroma_sqlite::Grant {
                    read: storage.core.read,
                    write: storage.core.write,
                },
            ))
        });
        let net = manifest.permissions.as_ref().map(|p| &p.net);
        let lan = net
            .filter(|net| !net.discovery.is_empty())
            .map(|net| Arc::new(lan::ModuleLan::new(id, &net.discovery)));
        let programs = Arc::new(programs::Programs::new(
            id,
            self.dir(id),
            helpers_dir,
            manifest.permissions.as_ref().map(|p| p.run.clone()).unwrap_or_default(),
            manifest.helpers.clone(),
            gateway.clone(),
            first_party,
        ));
        programs.reap_all_stale();
        let mut env = vec![
            ("KROMA_MODULE_ID".to_string(), id.to_string()),
            ("KROMA_HOST_TOKEN".to_string(), self.port_token(id)),
            ("KROMA_CORE_URL".to_string(), "http://core".to_string()),
            ("KROMA_CORE_PORT".to_string(), self.cfg.core_port.to_string()),
            ("KROMA_DB_PATH".to_string(), CORE_DATABASE.to_string()),
            ("KROMA_DATA_DIR".to_string(), self.cfg.data_dir.to_string_lossy().into_owned()),
            ("TMPDIR".to_string(), "/tmp".to_string()),
        ];
        for name in LOG_FILTERS {
            if let Ok(value) = std::env::var(name) {
                env.push((name.to_string(), value));
            }
        }
        for name in manifest.permissions.iter().flat_map(|p| p.env.iter()) {
            if let Ok(value) = std::env::var(name) {
                env.push((name.clone(), value));
            }
        }
        let needs = manifest.component;
        let instances = needs.instances.unwrap_or(1).clamp(1, MAX_INSTANCES) as usize;
        let pool = Arc::new(Pool {
            module: id.to_string(),
            component,
            outside: Arc::new(outside::Outside {
                module: id.to_string(),
                token,
                host_socket: self.host_socket(),
                gateway,
                network: wiring.network.0.clone(),
                no_network,
                roots: roots.clone(),
            }),
            env,
            limits: limits_of(needs),
            files: Arc::new(files::ModuleFiles::new(roots.clone())),
            roots,
            databases,
            programs,
            lan,
            idle: Mutex::new(Vec::new()),
            slots: Semaphore::new(instances),
            capacity: u32::try_from(instances).unwrap_or(1),
            awake: AtomicBool::new(true),
            say,
        });
        let app = axum::Router::new().fallback(answer).with_state(pool.clone());
        tasks.push(
            wiring
                .runtime
                .spawn(async move {
                    let _ = axum::serve(listener, app).await;
                })
                .abort_handle(),
        );
        tasks.push(wiring.runtime.spawn(tick_forever(pool.clone())).abort_handle());
        self.procs.write().unwrap().insert(
            id.to_string(),
            Proc {
                endpoint: endpoint.clone(),
                media,
                component: pool,
                _gateway: Running { tasks },
            },
        );
        self.say(
            id,
            &format!(
                "INFO contained: a WebAssembly component, {} in {} ms",
                match readied {
                    Readied::Compiled => "compiled",
                    Readied::FromCache => "ready from its compiled copy",
                },
                started.elapsed().as_millis()
            ),
        );
        Ok(endpoint)
    }
}
