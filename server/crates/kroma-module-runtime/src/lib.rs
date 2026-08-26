//! The out-of-process module runtime: each module is its own binary. `main()`
//! calls [`serve`], which builds a [`RemoteHost`] ([`HostCtx`]) proxying
//! settings, events, sessions and jobs to the core over `/api/_host/*`.
//!
//! Databases are a CAPABILITY, not part of the runtime: only a module built with
//! the `storage` feature opens one, and it opens two -- its own file, and the
//! core database behind the grant its manifest declared. A module without the
//! feature does not link SQLite at all, which is most of the size of a sidecar
//! that never had a table.

use std::any::{Any, TypeId};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use kroma_domain::{Permission, User};
use kroma_module_host::host_token::{require_host_token, HostToken};
use kroma_module_host::{json_error, Event, HostCtx, ServerModule};

struct Env {
    module_id: String,
    port: u16,
    core_url: String,
    host_token: String,
    // Only read under `storage`: a module that declares none never learns where
    // the core database is, which is the capability said in one more place.
    #[cfg(feature = "storage")]
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
            #[cfg(feature = "storage")]
            db_path: PathBuf::from(get("KROMA_DB_PATH")?),
            data_dir: PathBuf::from(get("KROMA_DATA_DIR")?),
        })
    }

    /// The grant the core spawned this module with, as its manifest declared it.
    /// Absent or unreadable is the empty grant: a pool that answers nothing,
    /// never an unscoped one.
    #[cfg(feature = "storage")]
    fn grant(&self) -> kroma_db::Grant {
        let Ok(json) = std::env::var("KROMA_MODULE_GRANT") else {
            return kroma_db::Grant::none();
        };
        serde_json::from_str(&json).unwrap_or_else(|error| {
            tracing::error!(%error, "core sent a storage grant this build cannot read; denying all");
            kroma_db::Grant::none()
        })
    }

    /// The module's own database, beside the files the core unpacked it into.
    #[cfg(feature = "storage")]
    fn store_path(&self) -> PathBuf {
        self.data_dir
            .join("modules")
            .join(&self.module_id)
            .join("module.sqlite")
    }
}

/// The out-of-process [`HostCtx`]: settings, events, sessions and jobs go to the
/// core over the callback API; the databases (behind `storage`) are opened here,
/// because SQLite in WAL mode is multi-process and a query has no business
/// becoming an HTTP round-trip.
#[derive(Clone)]
pub struct RemoteHost {
    inner: Arc<Inner>,
}

struct Inner {
    module_id: String,
    data_dir: PathBuf,
    #[cfg(feature = "storage")]
    store: kroma_db::Pool,
    #[cfg(feature = "storage")]
    core: kroma_db::Pool,
    core_url: String,
    host_token: String,
    services: RwLock<HashMap<TypeId, Arc<dyn Any + Send + Sync>>>,
    // The metadata language, cached: it is one env-derived string, and every
    // caller that renames a file asks for it.
    language: RwLock<Option<String>>,
}

impl RemoteHost {
    fn new(env: &Env) -> anyhow::Result<Self> {
        Ok(Self {
            inner: Arc::new(Inner {
                module_id: env.module_id.clone(),
                data_dir: env.data_dir.clone(),
                // `open`, not `init`: the module's own file has no core schema
                // in it, only whatever its own `migrations()` create below.
                #[cfg(feature = "storage")]
                store: kroma_db::open(&env.store_path())?,
                #[cfg(feature = "storage")]
                core: kroma_db::init_scoped(&env.db_path, &env.module_id, &env.grant())?,
                core_url: env.core_url.clone(),
                host_token: env.host_token.clone(),
                services: RwLock::new(HashMap::new()),
                language: RwLock::new(None),
            }),
        })
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

    fn callback(&self) -> kroma_http::Loopback {
        kroma_http::Loopback::new()
            .header("authorization", format!("Bearer {}", self.inner.host_token))
    }

    fn host_url(&self, path: &str) -> String {
        format!(
            "{}/api/_host/{path}",
            self.inner.core_url.trim_end_matches('/')
        )
    }
}

#[cfg(feature = "storage")]
impl kroma_module_host::HostStorage for RemoteHost {
    fn db(&self) -> &kroma_db::Pool {
        &self.inner.core
    }

    fn store(&self) -> &kroma_db::Pool {
        &self.inner.store
    }
}

impl HostCtx for RemoteHost {
    fn data_dir(&self) -> &Path {
        &self.inner.data_dir
    }

    // Asked of the core rather than read from the `sessions` table.
    fn session_user(&self, token: &str) -> Option<User> {
        // POSTed, not queried: the token is the caller's live session.
        self.callback()
            .post_json(
                &self.host_url("session"),
                &serde_json::json!({ "token": token }),
            )
            .ok()?
            .json::<Option<User>>()
            .ok()
            .flatten()
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
        let _ = self.callback().post_json(
            &self.host_url("settings"),
            &serde_json::json!({ "patch": patch }),
        );
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
        let body = serde_json::json!({ "audience": audience, "spec": spec });
        self.callback()
            .post_json(&self.host_url("notify"), &body)
            .ok()
            .and_then(|r| r.json::<serde_json::Value>().ok())
            .and_then(|v| v.get("sent").and_then(serde_json::Value::as_u64))
            .unwrap_or(0) as usize
    }

    fn trigger_job(&self, key: &'static str, reason: &'static str) {
        let _ = self.callback().post_json(
            &self.host_url("job"),
            &serde_json::json!({ "key": key, "reason": reason }),
        );
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
        self.callback()
            .get_json(&self.host_url("libraries"))
            .unwrap_or_default()
    }

    fn secret(&self, name: &str) -> Option<String> {
        self.callback()
            .query("name", name)
            .get_json::<Option<String>>(&self.host_url("secret"))
            .ok()
            .flatten()
    }

    fn metadata_language(&self) -> String {
        if let Some(v) = self.inner.language.read().unwrap().clone() {
            return v;
        }
        let asked = self
            .callback()
            .get_json::<String>(&self.host_url("metadata-language"))
            .ok()
            .filter(|v| !v.is_empty());
        // Only a real answer is cached, so a transient failure retries rather
        // than pinning the fallback for the life of the process.
        match asked {
            Some(v) => {
                *self.inner.language.write().unwrap() = Some(v.clone());
                v
            }
            None => "en-US".to_string(),
        }
    }

    // Asked of the core, which owns the supervisor: a sidecar cannot see which
    // of its peers is installed or running, and must not care.
    fn contributions(&self, point: &str) -> Vec<kroma_module_host::Contribution> {
        self.callback()
            .query("point", point)
            .get_json::<Vec<kroma_module_host::Contribution>>(&self.host_url("contributions"))
            .unwrap_or_default()
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
    serve(
        |host| {
            setup(host);
            axum::Router::new()
        },
        vec![module],
    )
    .await
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

/// Run a module process: `wire` builds the process's own services and port
/// providers against the live host and hands back whatever extra routes it
/// serves, each module's `admin_routes` are mounted beside them on the assigned
/// port, and every module's `on_enable` runs. A process may host several modules
/// or none (a port-provider-only process).
///
/// `wire` takes the host rather than running before it, because a provider that
/// answers out of a database has to be built holding that database: the port
/// contract it implements names only [`HostCtx`], so the pools cannot arrive
/// through the call.
pub async fn serve(
    wire: impl FnOnce(&RemoteHost) -> axum::Router<RemoteHost>,
    modules: Vec<Box<dyn ServerModule<RemoteHost>>>,
) -> anyhow::Result<()> {
    init_tracing();
    let env = Env::from_process()?;
    let host = RemoteHost::new(&env)?;
    tracing::info!(module = %env.module_id, port = env.port, "module process starting");

    apply_module_migrations(&host, &modules)?;
    // Shared from here on: the event delivery route dispatches to a module at
    // request time, so the set has to outlive this function.
    let modules = Arc::new(modules);
    let extra = wire(&host);

    for module in modules.iter() {
        module.on_enable(host.clone()).await;
    }

    let (job_fns, job_specs) = collect_jobs(&modules);
    let topics = wanted_topics(&modules);

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
    for module in modules.iter() {
        if let Some(routes) = module.admin_routes(&host) {
            app = app.merge(routes);
        }
    }
    if !job_fns.is_empty() {
        app = app.merge(job_router(job_fns, env.host_token.clone()));
    }
    if !topics.is_empty() {
        let subscribers = Arc::new(Subscribers::new(modules.clone(), &topics));
        app = app.merge(event_router(subscribers, env.host_token.clone()));
    }
    let shutdown_host = host.clone();
    let app = app.with_state(host);

    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], env.port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "module listening");

    announce_to_core(&env, job_specs, &topics);

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
            for module in modules.iter() {
                module.on_disable(shutdown_host.clone()).await;
            }
        })
        .await?;
    Ok(())
}

// What this process serves and what it asks the core for, gathered before the
// router is built. Kept out of [`serve`] because each is a loop over the modules
// with its own rule, and `serve`'s own job is the order the parts come up in.
fn collect_jobs(
    modules: &[Box<dyn ServerModule<RemoteHost>>],
) -> (HashMap<&'static str, JobFn>, Vec<JobSpec>) {
    // job_fns backs /_job/run/{key}; job_specs registers with the core scheduler.
    let mut job_fns: HashMap<&'static str, JobFn> = HashMap::new();
    let mut job_specs: Vec<JobSpec> = Vec::new();
    for job in modules.iter().flat_map(|module| module.jobs()) {
        job_fns.insert(job.key, job.run);
        job_specs.push(JobSpec {
            key: job.key.to_string(),
            category: job.category.to_string(),
            schedule: job.schedule.map(str::to_string),
        });
    }
    (job_fns, job_specs)
}

// Deduplicated: two modules in one process may both want a topic, and the core
// should be told about it once.
fn wanted_topics(modules: &[Box<dyn ServerModule<RemoteHost>>]) -> Vec<String> {
    let mut seen: Vec<String> = Vec::new();
    for topic in modules.iter().flat_map(|module| module.events()) {
        if !seen.iter().any(|t| t == topic) {
            seen.push(topic.to_string());
        }
    }
    seen
}

// Jobs and event topics, announced only after the listener is bound, so a run the
// core fires immediately queues on the accept backlog rather than failing to
// connect. Best-effort: a failed registration leaves the job or the subscription
// absent until respawn.
fn announce_to_core(env: &Env, job_specs: Vec<JobSpec>, topics: &[String]) {
    let host_url = |path: &str| format!("{}/api/_host/{path}", env.core_url.trim_end_matches('/'));
    if !job_specs.is_empty() {
        let url = host_url("register-job");
        let module_id = env.module_id.clone();
        let host_token = env.host_token.clone();
        tokio::task::spawn_blocking(move || {
            register_jobs(&url, &module_id, &host_token, &job_specs);
        });
    }
    if !topics.is_empty() {
        let url = host_url("register-events");
        let module_id = env.module_id.clone();
        let host_token = env.host_token.clone();
        let topics = topics.to_vec();
        tokio::task::spawn_blocking(move || {
            register_events(&url, &module_id, &host_token, &topics);
        });
    }
}

// A module's `migrations()` run against its OWN database, never the shared one:
// the core database's schema is the core's, and a module that could add a table
// to it could add a trigger to one it cannot read.
#[cfg(feature = "storage")]
fn apply_module_migrations(
    host: &RemoteHost,
    modules: &[Box<dyn ServerModule<RemoteHost>>],
) -> anyhow::Result<()> {
    use kroma_module_host::HostStorage;
    for module in modules {
        let migrations = module.migrations();
        if !migrations.is_empty() {
            let conn = host.store().get()?;
            kroma_db::apply_migrations(&conn, migrations)?;
        }
    }
    Ok(())
}

#[cfg(not(feature = "storage"))]
fn apply_module_migrations(
    _host: &RemoteHost,
    modules: &[Box<dyn ServerModule<RemoteHost>>],
) -> anyhow::Result<()> {
    for module in modules {
        anyhow::ensure!(
            module.migrations().is_empty(),
            "'{}' declares migrations but was built without the storage capability; add \
             `storage` to its module.json and enable the SDK's `storage` feature",
            module.id(),
        );
    }
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
        .route_layer(axum::middleware::from_fn_with_state(
            HostToken(token),
            require_host_token,
        ))
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
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("job panicked: {e}"),
            )
                .into_response()
        }
    }
}

// Which modules in this process asked for which topic. Held as trait objects
// because delivery dispatches on the topic at request time, not at wiring time.
struct Subscribers {
    modules: Arc<Vec<Box<dyn ServerModule<RemoteHost>>>>,
    by_topic: HashMap<String, Vec<usize>>,
}

impl Subscribers {
    fn new(modules: Arc<Vec<Box<dyn ServerModule<RemoteHost>>>>, topics: &[String]) -> Self {
        let mut by_topic: HashMap<String, Vec<usize>> = HashMap::new();
        for topic in topics {
            let want = modules
                .iter()
                .enumerate()
                .filter(|(_, m)| m.events().iter().any(|t| t == topic))
                .map(|(i, _)| i)
                .collect();
            by_topic.insert(topic.clone(), want);
        }
        Self { modules, by_topic }
    }
}

fn event_router(subscribers: Arc<Subscribers>, token: String) -> axum::Router<RemoteHost> {
    axum::Router::new()
        .route("/_event/{topic}", axum::routing::post(deliver_event))
        .route_layer(axum::middleware::from_fn_with_state(
            HostToken(token),
            require_host_token,
        ))
        .layer(axum::Extension(subscribers))
}

// Answers before the handlers run: the core is fanning out to every subscriber
// and must not be held up by one module's work, and it has nothing to do with a
// failure anyway. A handler that needs to report something publishes or notifies.
async fn deliver_event(
    axum::extract::State(host): axum::extract::State<RemoteHost>,
    axum::Extension(subscribers): axum::Extension<Arc<Subscribers>>,
    axum::extract::Path(topic): axum::extract::Path<String>,
    axum::Json(payload): axum::Json<serde_json::Value>,
) -> StatusCode {
    let Some(want) = subscribers.by_topic.get(&topic) else {
        tracing::debug!(%topic, "event delivered for a topic this process did not ask for");
        return StatusCode::NOT_FOUND;
    };
    let want = want.clone();
    let modules = subscribers.modules.clone();
    tokio::spawn(async move {
        for index in want {
            modules[index]
                .on_event(host.clone(), topic.clone(), payload.clone())
                .await;
        }
    });
    StatusCode::ACCEPTED
}

fn register_events(url: &str, module_id: &str, host_token: &str, topics: &[String]) {
    let body = serde_json::json!({ "moduleId": module_id, "topics": topics });
    match kroma_http::Loopback::new()
        .header("authorization", format!("Bearer {host_token}"))
        .post_json(url, &body)
    {
        Ok(resp) if (200..300).contains(&resp.status) => {
            tracing::info!(?topics, "subscribed to core events");
        }
        Ok(resp) => tracing::warn!(
            status = resp.status,
            "core rejected the event subscription: {}",
            resp.text()
        ),
        Err(e) => tracing::warn!("could not subscribe to core events: {e:#}"),
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
        match kroma_http::Loopback::new()
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
