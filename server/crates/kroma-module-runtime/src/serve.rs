use std::sync::Arc;

use kroma_module_host::host_token::{require_host_token, HostToken};
use kroma_module_host::ServerModule;

use crate::env::Env;
use crate::events::register_events;
use crate::events::{event_router, wanted_topics, Subscribers};
use crate::jobs::{collect_jobs, job_router, register_jobs, JobSpec};
use crate::migrations::apply_module_migrations;
use crate::remote_host::RemoteHost;

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
