//! Serving, and stopping: the HTTP listener (plus the optional HTTPS one), the
//! socket modules call back on, and the shutdown that must outlive the process —
//! sidecars survive their parent, so failing to stop them orphans them.

use anyhow::Context;
use kroma_engine::state;
use tracing::info;

use crate::api;
use crate::boot::https::{
    build_https, cert_download_route, https_redirect_router, spawn_https_listener,
};
use crate::boot::seam::{SeamSocket, Served};

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
    let mut app = api::router(state.clone(), supervisor.clone(), subscriptions.clone());

    // Built before serving so the cert-download route can be merged into the router.
    let https = build_https(&state).await;
    let mut cert_pem_shared: Option<std::sync::Arc<String>> = None;
    if let Some((cert_path, _, _)) = &https {
        let cert_pem = std::sync::Arc::new(
            tokio::fs::read_to_string(cert_path)
                .await
                .unwrap_or_default(),
        );
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

    let seam = open_seam(&state, &supervisor, subscriptions);
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

    let stopping = std::sync::Arc::new(tokio::sync::Notify::new());
    let signalled = stopping.clone();
    // Connect-info so handlers can read the client address (LAN/WAN classification).
    let server = axum::serve(
        listener,
        http_app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(async move {
        shutdown_signal().await;
        signalled.notify_one();
    });
    until_drained(server, &stopping)
        .await
        .context("server error")?;

    https_handle.graceful_shutdown(Some(std::time::Duration::from_secs(3)));

    info!("shutting down: cancelling running jobs + stopping module processes");
    state.jobs.cancel_all();
    await_jobs_drained(&state).await;
    // Blocking: each sidecar gets a grace period to run its own shutdown hooks.
    let _ = tokio::task::spawn_blocking(move || supervisor.stop_all()).await;
    drop(seam);
    let network = state.network.clone();
    if let Ok(Err(e)) = tokio::task::spawn_blocking(move || network.flush()).await {
        tracing::warn!("the last network tallies could not be written: {e:#}");
    }
    Ok(())
}

fn open_seam(
    state: &state::SharedState,
    supervisor: &std::sync::Arc<kroma_module_supervisor::Supervisor>,
    subscriptions: std::sync::Arc<api::host_events::Subscriptions>,
) -> (SeamSocket, Option<Served>) {
    let socket = SeamSocket::bind(supervisor);
    let served = socket.serve(api::seam::router(
        state.clone(),
        supervisor.clone(),
        subscriptions,
    ));
    (socket, served)
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

async fn until_drained(
    server: impl std::future::IntoFuture<Output = std::io::Result<()>>,
    stopping: &tokio::sync::Notify,
) -> std::io::Result<()> {
    let window = async {
        stopping.notified().await;
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;
    };
    tokio::select! {
        served = server => served,
        () = window => {
            info!("connections still open after the drain window; stopping anyway");
            Ok(())
        }
    }
}

async fn await_jobs_drained(state: &state::SharedState) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
    while state.jobs.running_count() > 0 && std::time::Instant::now() < deadline {
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
}

pub(super) async fn shutdown_signal() {
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
        () = kroma_engine::services::updates::wait_for_restart() => {}
    }
    info!("shutdown signal received");
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use tokio::sync::Notify;
    use tokio::time::Instant;

    use super::until_drained;

    fn never_drains() -> std::future::Pending<std::io::Result<()>> {
        std::future::pending()
    }

    #[tokio::test(start_paused = true)]
    async fn an_open_connection_holds_a_stop_for_ten_seconds_at_most() {
        let stopping = Notify::new();
        stopping.notify_one();
        let started = Instant::now();

        let stopped = until_drained(never_drains(), &stopping).await;

        assert!(stopped.is_ok());
        assert_eq!(started.elapsed(), Duration::from_secs(10));
    }

    #[tokio::test(start_paused = true)]
    async fn a_server_that_drains_in_time_stops_without_waiting() {
        let stopping = Notify::new();
        stopping.notify_one();
        let started = Instant::now();

        let stopped = until_drained(std::future::ready(Ok(())), &stopping).await;

        assert!(stopped.is_ok());
        assert_eq!(started.elapsed(), Duration::ZERO);
    }

    #[tokio::test(start_paused = true)]
    async fn the_window_opens_only_once_the_stop_is_signalled() {
        let stopping = Notify::new();
        let serving = until_drained(never_drains(), &stopping);

        let waited = tokio::time::timeout(Duration::from_secs(3600), serving).await;

        assert!(waited.is_err());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_module_reaches_the_host_callbacks_on_the_cores_socket_and_no_route_a_client_reaches()
    {
        let t = crate::api::test_support::test_app();
        let socket = t.supervisor.host_socket();
        let base = kroma_http::loopback::unix_url(&socket);
        let seam = super::open_seam(&t.state, &t.supervisor, std::sync::Arc::default());

        let (callback, client_route) = tokio::task::spawn_blocking(move || {
            let callback = kroma_http::Loopback::new()
                .header("authorization", "Bearer test-host-token")
                .get(&format!(
                    "{base}/api/_host/setting?key=serverName&kind=str&default="
                ))
                .map(|resp| resp.status);
            let client_route = kroma_http::Loopback::new()
                .get(&format!("{base}/api/auth/config"))
                .map(|resp| resp.status);
            (callback.unwrap(), client_route.unwrap())
        })
        .await
        .unwrap();
        drop(seam);

        assert_eq!(callback, 200);
        assert_eq!(client_route, 404);
        assert!(!socket.exists(), "the socket goes when the server stops");
        let _ = std::fs::remove_dir(socket.parent().unwrap());
    }
}
