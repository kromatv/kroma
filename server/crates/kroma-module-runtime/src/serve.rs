#[cfg(any(target_family = "wasm", test))]
use std::sync::Arc;

#[cfg(any(target_family = "wasm", test))]
use kroma_module_host::host_token::{require_host_token, HostToken};
use kroma_module_host::ServerModule;

#[cfg(any(target_family = "wasm", test))]
use crate::env::Env;
#[cfg(any(target_family = "wasm", test))]
use crate::events::{event_router, register_events, wanted_topics, Subscribers};
#[cfg(any(target_family = "wasm", test))]
use crate::jobs::{collect_jobs, job_router, register_jobs, JobSpec};
#[cfg(any(target_family = "wasm", test))]
use crate::migrations::apply_module_migrations;
use crate::remote_host::RemoteHost;

#[cfg(not(target_family = "wasm"))]
const NATIVE: &str = "a KROMA module runs only as a WebAssembly component inside the server";

type Modules = Vec<Box<dyn ServerModule<RemoteHost>>>;

/// Run a module serving one `ServerModule`. Convenience over [`serve`].
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

/// Run a module: `wire` builds its own services and port providers against the
/// live host and hands back whatever extra routes it serves, each module's
/// `admin_routes` are mounted beside them, and every module's `on_enable` runs.
/// A component may host several modules or none (a port-provider-only one).
///
/// `wire` takes the host rather than running before it, because a provider that
/// answers out of a database has to be built holding that database: the port
/// contract it implements names only [`HostCtx`](kroma_module_host::HostCtx), so
/// the pools cannot arrive through the call.
///
/// A module runs only as a WebAssembly component: built for any other target,
/// this refuses to start it.
pub async fn serve(
    wire: impl FnOnce(&RemoteHost) -> axum::Router<RemoteHost>,
    modules: Modules,
) -> anyhow::Result<()> {
    #[cfg(target_family = "wasm")]
    {
        let (app, modules, host) = started(Env::from_process()?, wire, modules).await?;
        crate::guest::install_router(app);
        crate::guest::on_stop(move || {
            let modules = modules.clone();
            let host = host.clone();
            Box::pin(async move {
                for module in modules.iter() {
                    module.on_disable(host.clone()).await;
                }
            })
        });
        Ok(())
    }

    #[cfg(not(target_family = "wasm"))]
    {
        let _ = (wire, modules);
        anyhow::bail!(NATIVE)
    }
}

/// The `main` [`module_main!`](crate::module_main) gives a module built for any
/// target but a WebAssembly component: it says that a module runs only as one,
/// and fails.
#[cfg(not(target_family = "wasm"))]
pub fn refuse_native(
    wire: impl FnOnce(&RemoteHost) -> axum::Router<RemoteHost>,
    modules: Modules,
) -> std::process::ExitCode {
    let _ = (wire, modules);
    eprintln!("{NATIVE}");
    std::process::ExitCode::FAILURE
}

#[cfg(any(target_family = "wasm", test))]
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

#[cfg(any(target_family = "wasm", test))]
pub(crate) async fn started(
    env: Env,
    wire: impl FnOnce(&RemoteHost) -> axum::Router<RemoteHost>,
    modules: Modules,
) -> anyhow::Result<(axum::Router, Arc<Modules>, RemoteHost)> {
    init_tracing();
    let host = RemoteHost::new(&env)?;

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
    // proxy, which sits outside the session gate: without this guard an
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
    let app = app.with_state(host.clone());

    announce_to_core(&env, job_specs, &topics);
    Ok((app, modules, host))
}

#[cfg(any(target_family = "wasm", test))]
fn announce_to_core(env: &Env, job_specs: Vec<JobSpec>, topics: &[String]) {
    let host_url = |path: &str| format!("{}/api/_host/{path}", env.core_url.trim_end_matches('/'));
    if !job_specs.is_empty() {
        let url = host_url("register-job");
        let module_id = env.module_id.clone();
        let host_token = env.host_token.clone();
        off_the_runtime(move || {
            register_jobs(&url, &module_id, &host_token, &job_specs);
        });
    }
    if !topics.is_empty() {
        let url = host_url("register-events");
        let module_id = env.module_id.clone();
        let host_token = env.host_token.clone();
        let topics = topics.to_vec();
        off_the_runtime(move || {
            register_events(&url, &module_id, &host_token, &topics);
        });
    }
}

#[cfg(all(test, not(target_family = "wasm")))]
fn off_the_runtime(work: impl FnOnce() + Send + 'static) {
    tokio::task::spawn_blocking(work);
}

// A component has one thread, and its host answers a call before returning.
#[cfg(target_family = "wasm")]
fn off_the_runtime(work: impl FnOnce() + Send + 'static) {
    work();
}
