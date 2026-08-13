//! The out-of-process module runtime: each module is its own binary. `main()`
//! calls [`serve`], which opens the shared SQLite directly and builds a
//! [`RemoteHost`] ([`HostCtx`]) proxying settings, events and jobs to the core
//! over `/api/_host/*`.

use std::any::{Any, TypeId};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use kroma_db::Pool;
use kroma_domain::{Permission, User};
use kroma_module_host::host_token::{require_host_token, HostToken};
use kroma_module_host::{json_error, Event, HostCtx, ServerModule};

struct Env {
    module_id: String,
    port: u16,
    core_url: String,
    host_token: String,
    db_path: PathBuf,
    data_dir: PathBuf,
}

impl Env {
    fn from_process() -> anyhow::Result<Self> {
        let get = |k: &str| std::env::var(k).map_err(|_| anyhow::anyhow!("{k} not set"));
        Ok(Self {
            module_id: get("KROMA_MODULE_ID")?,
            port: get("KROMA_MODULE_PORT")?.parse()?,
            core_url: get("KROMA_CORE_URL")?,
            host_token: get("KROMA_HOST_TOKEN")?,
            db_path: PathBuf::from(get("KROMA_DB_PATH")?),
            data_dir: PathBuf::from(get("KROMA_DATA_DIR")?),
        })
    }
}

/// The out-of-process [`HostCtx`]: `db()` is direct on the shared SQLite;
/// settings, events and jobs go to the core over the callback API.
#[derive(Clone)]
pub struct RemoteHost {
    inner: Arc<Inner>,
}

struct Inner {
    module_id: String,
    data_dir: PathBuf,
    db: Pool,
    core_url: String,
    host_token: String,
    services: RwLock<HashMap<TypeId, Arc<dyn Any + Send + Sync>>>,
    tmdb: RwLock<Option<serde_json::Value>>,
}

impl RemoteHost {
    fn new(env: &Env) -> anyhow::Result<Self> {
        // `init` is idempotent; the core has already migrated by the time we spawn.
        let db = kroma_db::init(&env.db_path)?;
        Ok(Self {
            inner: Arc::new(Inner {
                module_id: env.module_id.clone(),
                data_dir: env.data_dir.clone(),
                db,
                core_url: env.core_url.clone(),
                host_token: env.host_token.clone(),
                services: RwLock::new(HashMap::new()),
                tmdb: RwLock::new(None),
            }),
        })
    }

    fn tmdb_config(&self) -> serde_json::Value {
        if let Some(v) = self.inner.tmdb.read().unwrap().clone() {
            return v;
        }
        let v = self
            .callback()
            .get_json::<serde_json::Value>(&self.host_url("tmdb"))
            .unwrap_or(serde_json::Value::Null);
        // Only cache a real answer so a transient failure retries next call.
        if !v.is_null() {
            *self.inner.tmdb.write().unwrap() = Some(v.clone());
        }
        v
    }

    pub fn module_id(&self) -> &str {
        &self.inner.module_id
    }

    /// Register a module-owned concrete service so its own code can resolve it by
    /// type through `service::<T>(host)`. Keyed like the in-process registry:
    /// concrete `TypeId::of::<T>()`, single `Arc`.
    pub fn register_service<T: Any + Send + Sync>(&self, service: Arc<T>) {
        self.inner
            .services
            .write()
            .unwrap()
            .insert(TypeId::of::<T>(), service as Arc<dyn Any + Send + Sync>);
    }

    /// Register a cross-module PORT provider (a `dyn Trait` object), keyed like
    /// [`kroma_module_host::port_service`] so consumers resolve it via
    /// `resolve_port::<dyn Trait>(host)`.
    pub fn register_port<P: ?Sized + Any + Send + Sync>(&self, port: Arc<P>) {
        let (tid, val) = kroma_module_host::port_service(port);
        self.inner.services.write().unwrap().insert(tid, val);
    }

    fn callback(&self) -> kroma_http::Fetch {
        kroma_http::Fetch::new().header("authorization", format!("Bearer {}", self.inner.host_token))
    }

    fn host_url(&self, path: &str) -> String {
        format!("{}/api/_host/{path}", self.inner.core_url.trim_end_matches('/'))
    }
}

impl HostCtx for RemoteHost {
    fn db(&self) -> &Pool {
        &self.inner.db
    }

    fn data_dir(&self) -> &Path {
        &self.inner.data_dir
    }

    fn require(&self, user: &User, perm: Permission) -> Result<(), Response> {
        if user.can(perm) {
            Ok(())
        } else {
            Err(json_error(StatusCode::FORBIDDEN, "forbidden"))
        }
    }

    fn require_any_admin(&self, user: &User) -> Result<(), Response> {
        if user.is_any_admin() {
            Ok(())
        } else {
            Err(json_error(StatusCode::FORBIDDEN, "forbidden"))
        }
    }

    fn lerr(&self, _user: &User, status: StatusCode, key: &str) -> Response {
        // No i18n catalogs out-of-process; the frontend localizes known error keys.
        json_error(status, key)
    }

    fn setting_str(&self, key: &str, default: &str) -> String {
        self.callback()
            .query("key", key)
            .query("kind", "str")
            .query("default", default)
            .get_json::<serde_json::Value>(&self.host_url("setting"))
            .ok()
            .and_then(|v| v.get("value").and_then(|x| x.as_str().map(str::to_string)))
            .unwrap_or_else(|| default.to_string())
    }

    fn setting_bool(&self, key: &str, default: bool) -> bool {
        self.callback()
            .query("key", key)
            .query("kind", "bool")
            .query("default", default.to_string())
            .get_json::<serde_json::Value>(&self.host_url("setting"))
            .ok()
            .and_then(|v| v.get("value").and_then(serde_json::Value::as_bool))
            .unwrap_or(default)
    }

    fn setting_i64(&self, key: &str, default: i64) -> i64 {
        self.callback()
            .query("key", key)
            .query("kind", "i64")
            .query("default", default.to_string())
            .get_json::<serde_json::Value>(&self.host_url("setting"))
            .ok()
            .and_then(|v| v.get("value").and_then(serde_json::Value::as_i64))
            .unwrap_or(default)
    }

    fn set_settings(&self, patch: std::collections::BTreeMap<String, serde_json::Value>) {
        let _ = self
            .callback()
            .post_json(&self.host_url("settings"), &serde_json::json!({ "patch": patch }));
    }

    fn publish(&self, event: Event) {
        let _ = self.callback().post_json(
            &self.host_url("events"),
            &serde_json::json!({ "topic": event.topic, "payload": event.payload }),
        );
    }

    fn publish_to(&self, user_id: &str, event: Event) {
        let _ = self.callback().post_json(
            &self.host_url("events_to"),
            &serde_json::json!({ "userId": user_id, "topic": event.topic, "payload": event.payload }),
        );
    }

    fn notify(
        &self,
        audience: &kroma_module_host::Audience,
        spec: &kroma_module_host::NotificationSpec,
    ) -> usize {
        // The core resolves, filters, persists and pushes; this only ships the intent.
        let Ok(body) = serde_json::to_value(serde_json::json!({
            "audience": audience,
            "spec": spec,
        })) else {
            return 0;
        };
        self.callback()
            .post_json(&self.host_url("notify"), &body)
            .ok()
            .and_then(|r| r.json::<serde_json::Value>().ok())
            .and_then(|v| v.get("sent").and_then(serde_json::Value::as_u64))
            .unwrap_or(0) as usize
    }

    fn trigger_job(&self, key: &'static str, reason: &'static str) {
        let _ = self
            .callback()
            .post_json(&self.host_url("job"), &serde_json::json!({ "key": key, "reason": reason }));
    }

    fn module_enabled(&self, id: &str) -> bool {
        self.callback()
            .query("id", id)
            .get_json::<serde_json::Value>(&self.host_url("enabled"))
            .ok()
            .and_then(|v| v.get("enabled").and_then(serde_json::Value::as_bool))
            // A module process only runs while enabled, so default to true.
            .unwrap_or(true)
    }

    fn library_folders(&self) -> Vec<kroma_module_host::LibraryFolders> {
        // The core owns Settings + Config; this process never links the engine.
        self.callback().get_json(&self.host_url("libraries")).unwrap_or_default()
    }

    fn tmdb_api_key(&self) -> Option<String> {
        self.tmdb_config().get("key").and_then(|x| x.as_str().map(str::to_string))
    }

    fn metadata_language(&self) -> String {
        self.tmdb_config()
            .get("language")
            .and_then(|x| x.as_str().map(str::to_string))
            .unwrap_or_else(|| "en-US".to_string())
    }

    // Asked of the core, which owns the supervisor: a sidecar cannot see which
    // of its peers is installed or running, and must not care.
    fn port_endpoint(&self, port: &str) -> Option<(String, String)> {
        let v = self
            .callback()
            .query("port", port)
            .get_json::<serde_json::Value>(&self.host_url("port"))
            .ok()?;
        let base = v.get("base")?.as_str()?.to_string();
        let token = v.get("token")?.as_str()?.to_string();
        Some((base, token))
    }

    fn get_service(&self, type_id: TypeId) -> Option<Arc<dyn Any + Send + Sync>> {
        self.inner.services.read().unwrap().get(&type_id).cloned()
    }
}

/// Run a module process serving one `ServerModule`. Convenience over [`serve`].
pub async fn serve_one(
    setup: impl FnOnce(&RemoteHost),
    module: Box<dyn ServerModule<RemoteHost>>,
) -> anyhow::Result<()> {
    serve(setup, vec![module], axum::Router::new()).await
}

// A module is a separate process, so it does not inherit the core's subscriber:
// without this it logged at a hardcoded `info` and there was no way to turn it
// up. `KROMA_MODULE_LOG` overrides `RUST_LOG` for the sidecars alone, so the
// core can stay quiet while one module is put under a microscope.
fn init_tracing() {
    let filter = std::env::var("KROMA_MODULE_LOG")
        .or_else(|_| std::env::var("RUST_LOG"))
        .unwrap_or_else(|_| "info".to_string());
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::new(filter))
        .with_target(true)
        .try_init()
        .ok();
}

/// Run a module process: `setup` wires the process's own services and port
/// providers into the host, each module's `admin_routes` plus `extra` routes are
/// served on the assigned port, and every module's `on_enable` runs. A process may
/// host several modules or none (a port-provider-only process).
pub async fn serve(
    setup: impl FnOnce(&RemoteHost),
    modules: Vec<Box<dyn ServerModule<RemoteHost>>>,
    extra: axum::Router<RemoteHost>,
) -> anyhow::Result<()> {
    init_tracing();
    let env = Env::from_process()?;
    let host = RemoteHost::new(&env)?;
    tracing::info!(module = %env.module_id, port = env.port, "module process starting");

    for module in &modules {
        let migrations = module.migrations();
        if !migrations.is_empty() {
            let conn = host.db().get()?;
            kroma_db::apply_migrations(&conn, migrations)?;
        }
    }
    setup(&host);

    for module in &modules {
        module.on_enable(Arc::new(host.clone()) as Arc<dyn HostCtx>).await;
    }

    // job_fns backs /_job/run/{key}; job_specs registers with the core scheduler.
    let mut job_fns: HashMap<&'static str, JobFn> = HashMap::new();
    let mut job_specs: Vec<JobSpec> = Vec::new();
    for module in &modules {
        for job in module.jobs() {
            job_fns.insert(job.key, job.run);
            job_specs.push(JobSpec {
                key: job.key.to_string(),
                category: job.category.to_string(),
                schedule: job.schedule.map(str::to_string),
            });
        }
    }

    // `extra`'s `/_port/*` routes are ALSO reachable through the core reverse
    // proxy, which sits outside the session gate — without this guard an
    // unauthenticated client could invoke privileged port actions. Applied before
    // `_health` so the liveness probe stays unauthenticated. The `_ready` route
    // anchors the layer: axum panics on `route_layer` over an empty router, and
    // a module without port routes hands one in (`serve_one`).
    let extra = extra
        .route("/_port/_ready", axum::routing::get(|| async { "ok" }))
        .route_layer(axum::middleware::from_fn_with_state(
            HostToken(env.host_token.clone()),
            require_host_token,
        ));

    let mut app = extra.route("/_health", axum::routing::get(|| async { "ok" }));
    for module in &modules {
        if let Some(routes) = module.admin_routes(&host) {
            app = app.merge(routes);
        }
    }
    if !job_fns.is_empty() {
        app = app.merge(job_router(job_fns, env.host_token.clone()));
    }
    let shutdown_host = Arc::new(host.clone()) as Arc<dyn HostCtx>;
    let app = app.with_state(host);

    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], env.port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "module listening");

    // Registered only after the listener is bound, so a run the core fires
    // immediately queues on the accept backlog rather than failing to connect.
    // Best-effort: a failed registration just leaves the job absent until respawn.
    if !job_specs.is_empty() {
        let register_url = format!("{}/api/_host/register-job", env.core_url.trim_end_matches('/'));
        let module_id = env.module_id.clone();
        let host_token = env.host_token.clone();
        tokio::task::spawn_blocking(move || {
            register_jobs(&register_url, &module_id, &host_token, &job_specs);
        });
    }

    let module_id = env.module_id.clone();
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            stop_signal().await;
            // The hooks run BEFORE the connection drain, not after: draining can
            // take as long as the slowest in-flight request, and the supervisor
            // only waits so long before killing us. Whatever a module owns
            // outside this process (the remote module's `cloudflared` child)
            // must be released while we still have a process to release it from.
            tracing::info!(module = %module_id, "stopping: releasing module resources");
            for module in &modules {
                module.on_disable(shutdown_host.clone()).await;
            }
        })
        .await?;
    Ok(())
}

/// Resolves when the supervisor asks this process to stop. A sidecar is a plain
/// child process, so SIGTERM is the only notice it gets before SIGKILL.
async fn stop_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        let mut term = match signal(SignalKind::terminate()) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!(error = %e, "cannot listen for SIGTERM; no clean shutdown");
                return std::future::pending().await;
            }
        };
        tokio::select! {
            _ = term.recv() => {}
            _ = tokio::signal::ctrl_c() => {}
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}

type JobFn = fn(&RemoteHost) -> anyhow::Result<()>;

struct JobSpec {
    key: String,
    category: String,
    schedule: Option<String>,
}

fn job_router(job_fns: HashMap<&'static str, JobFn>, token: String) -> axum::Router<RemoteHost> {
    axum::Router::new()
        .route("/_job/run/{key}", axum::routing::post(run_job))
        .route_layer(axum::middleware::from_fn_with_state(HostToken(token), require_host_token))
        .layer(axum::Extension(Arc::new(job_fns)))
}

async fn run_job(
    axum::extract::State(host): axum::extract::State<RemoteHost>,
    axum::Extension(job_fns): axum::Extension<Arc<HashMap<&'static str, JobFn>>>,
    axum::extract::Path(key): axum::extract::Path<String>,
) -> Response {
    let Some(&run) = job_fns.get(key.as_str()) else {
        tracing::warn!(job = %key, "run requested for a job this process does not have");
        return (StatusCode::NOT_FOUND, format!("unknown job {key}")).into_response();
    };
    tracing::info!(job = %key, "job starting");
    let started = std::time::Instant::now();
    let outcome = tokio::task::spawn_blocking(move || run(&host)).await;
    let elapsed_ms = started.elapsed().as_millis();
    match outcome {
        Ok(Ok(())) => {
            tracing::info!(job = %key, elapsed_ms, "job done");
            StatusCode::OK.into_response()
        }
        Ok(Err(e)) => {
            tracing::error!(job = %key, elapsed_ms, error = %format!("{e:#}"), "job failed");
            (StatusCode::INTERNAL_SERVER_ERROR, format!("{e:#}")).into_response()
        }
        Err(e) => {
            tracing::error!(job = %key, elapsed_ms, error = %e, "job panicked");
            (StatusCode::INTERNAL_SERVER_ERROR, format!("job panicked: {e}")).into_response()
        }
    }
}

fn register_jobs(url: &str, module_id: &str, host_token: &str, specs: &[JobSpec]) {
    for spec in specs {
        let body = serde_json::json!({
            "moduleId": module_id,
            "key": spec.key,
            "category": spec.category,
            "schedule": spec.schedule,
        });
        match kroma_http::Fetch::new()
            .header("authorization", format!("Bearer {host_token}"))
            .post_json(url, &body)
        {
            Ok(resp) if (200..300).contains(&resp.status) => {
                tracing::info!(job = %spec.key, "registered job with core scheduler");
            }
            Ok(resp) => tracing::warn!(
                job = %spec.key,
                status = resp.status,
                "core rejected job registration: {}",
                resp.text()
            ),
            Err(e) => {
                tracing::warn!(job = %spec.key, error = %format!("{e:#}"), "job registration failed")
            }
        }
    }
}
