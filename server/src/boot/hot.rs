//! The dev-only hot-patch loop. One listener held for the life of the process,
//! a router rebuilt every time `dx serve --hot-patch` lands a patch. Compiled
//! only under the `hotpatch` feature, so a release build has none of it, and no
//! HTTPS: the dev loop serves plain HTTP.

use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::Context;
use kroma_engine::state;
use kroma_module_supervisor::Supervisor;
use tracing::info;

use crate::api;

#[derive(Clone)]
struct Serving {
    state: state::SharedState,
    supervisor: Arc<Supervisor>,
    subscriptions: Arc<api::host_events::Subscriptions>,
    socket: Arc<std::net::TcpListener>,
}

/// Serve until the process is signalled, re-entering `serve_once` on each patch.
pub async fn run(
    state: state::SharedState,
    supervisor: Arc<Supervisor>,
    addr: SocketAddr,
) -> anyhow::Result<()> {
    let subscriptions = Arc::new(api::host_events::Subscriptions::default());
    api::host_events::deliver(state.clone(), supervisor.clone(), subscriptions.clone());

    // Bound once and cloned per patch: releasing the port between patches would
    // race every client that reconnects in that window.
    let socket =
        std::net::TcpListener::bind(addr).with_context(|| format!("failed to bind {addr}"))?;
    socket.set_nonblocking(true)?;

    supervisor.spawn_enabled(&*state);
    supervisor.spawn_watchdog();
    supervisor.spawn_hot_reload();

    info!("KROMA listening on http://{addr}  (hot-patch loop, plain HTTP)");

    let serving = Serving {
        state,
        supervisor,
        subscriptions,
        socket: Arc::new(socket),
    };
    spawn_teardown(serving.clone());

    dioxus_devtools::serve_subsecond_with_args(serving, |s| async move { serve_once(s).await })
        .await;
    Ok(())
}

async fn serve_once(s: Serving) {
    let app = api::router(
        s.state.clone(),
        s.supervisor.clone(),
        s.subscriptions.clone(),
    );
    let Ok(socket) = s.socket.try_clone() else {
        return;
    };
    let Ok(listener) = tokio::net::TcpListener::from_std(socket) else {
        return;
    };
    let _ = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await;
}

// A patch drops the serving future, so the shutdown path cannot live inside it:
// sidecars survive their parent, and failing to stop them orphans them.
fn spawn_teardown(s: Serving) {
    tokio::spawn(async move {
        super::serve::shutdown_signal().await;
        info!("shutting down: cancelling running jobs + stopping module processes");
        s.state.jobs.cancel_all();
        let _ = tokio::task::spawn_blocking(move || s.supervisor.stop_all()).await;
        std::process::exit(0);
    });
}
