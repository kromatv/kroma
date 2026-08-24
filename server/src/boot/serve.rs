//! Serving, and stopping: the HTTP listener (plus the optional HTTPS one), and
//! the shutdown that must outlive the process — sidecars survive their parent,
//! so failing to stop them orphans them.

use anyhow::Context;
use kroma_engine::state;
use tracing::info;

use crate::api;
use crate::boot::https::{
    build_https, cert_download_route, https_redirect_router, spawn_https_listener,
};

/// Serve until a shutdown signal, then stop the jobs and every module process.
/// Takes ownership of both: nothing outlives this call.
pub async fn run(
    state: state::SharedState,
    supervisor: std::sync::Arc<kroma_module_supervisor::Supervisor>,
    addr: std::net::SocketAddr,
) -> anyhow::Result<()> {
    // Module event subscriptions, and the task that delivers onto them. Started
    // here rather than while building the router: constructing a router must not
    // spawn anything, and this outlives it.
    let subscriptions = std::sync::Arc::new(api::host_events::Subscriptions::default());
    api::host_events::deliver(state.clone(), supervisor.clone(), subscriptions.clone());
    let mut app = api::router(state.clone(), supervisor.clone(), subscriptions);

    // Built before serving so the cert-download route can be merged into the router.
    let https = build_https(&state).await;
    let mut cert_pem_shared: Option<std::sync::Arc<String>> = None;
    if let Some((cert_path, _, _)) = &https {
        let cert_pem = std::sync::Arc::new(std::fs::read_to_string(cert_path).unwrap_or_default());
        app = app.route("/api/tls/cert.pem", cert_download_route(cert_pem.clone()));
        cert_pem_shared = Some(cert_pem);
    }

    // Off by default: a hard redirect onto a self-signed origin walls every
    // client behind a trust prompt, and some TV/native clients can't take it.
    let https_port = https.as_ref().map(|(_, _, sock)| sock.port());
    let redirect_to_https = https.is_some()
        && state
            .config
            .https_redirect_override
            .unwrap_or_else(|| state.settings.get_bool("httpsRedirect", false));

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("failed to bind {addr}"))?;

    if redirect_to_https {
        info!("KROMA listening on http://{addr}  (redirecting to https)");
    } else {
        info!("KROMA listening on http://{addr}  (API under /api)");
    }

    supervisor.spawn_enabled(&*state);
    supervisor.spawn_watchdog();
    supervisor.spawn_hot_reload();
    spawn_module_auto_update(&state, &supervisor);

    let https_handle = axum_server::Handle::new();
    spawn_https_listener(https, &app, https_handle.clone());

    let http_app = if redirect_to_https {
        https_redirect_router(
            https_port.expect("redirect_to_https implies HTTPS is running"),
            cert_pem_shared,
        )
    } else {
        app
    };

    // Connect-info so handlers can read the client address (LAN/WAN classification).
    axum::serve(
        listener,
        http_app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .context("server error")?;

    https_handle.graceful_shutdown(Some(std::time::Duration::from_secs(3)));

    info!("shutting down: cancelling running jobs + stopping module processes");
    state.jobs.cancel_all();
    await_jobs_drained(&state).await;
    // Blocking: each sidecar gets a grace period to run its own shutdown hooks.
    let _ = tokio::task::spawn_blocking(move || supervisor.stop_all()).await;
    Ok(())
}

fn spawn_module_auto_update(
    state: &state::SharedState,
    supervisor: &std::sync::Arc<kroma_module_supervisor::Supervisor>,
) {
    if !state.settings.get_bool("moduleAutoUpdate", true) {
        return;
    }
    let state = state.clone();
    let supervisor = supervisor.clone();
    tokio::spawn(async move {
        let updated = api::admin::store::install::auto_update(&state, &supervisor).await;
        if !updated.is_empty() {
            info!(
                count = updated.len(),
                "module auto-update: modules brought current"
            );
        }
    });
}

async fn await_jobs_drained(state: &state::SharedState) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
    while state.jobs.running_count() > 0 && std::time::Instant::now() < deadline {
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut sig) => {
                sig.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        () = ctrl_c => {}
        () = terminate => {}
    }
    info!("shutdown signal received");
}
