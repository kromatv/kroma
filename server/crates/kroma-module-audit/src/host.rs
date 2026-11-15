//! The host a module calls back into during an audit: the real callback router
//! over a stub that holds no library, no account and no secret.

use std::sync::Arc;

use axum::http::StatusCode;
use axum::routing::post;
use axum::Router;
use kroma_module_host::testing::StubHost;
use kroma_module_host::{NetworkPolicyOf, SettingReach, SettingReachOf};
use kroma_module_supervisor::{host_router, Supervisor};
use tokio::runtime::Handle;

const EVERY_DECLARED_KEY: SettingReachOf = SettingReachOf(|_| SettingReach::Declared);

async fn accepted() -> StatusCode {
    StatusCode::NO_CONTENT
}

pub(crate) fn serve(
    supervisor: &Arc<Supervisor>,
    network: NetworkPolicyOf,
    host: StubHost,
    runtime: &Handle,
) -> anyhow::Result<()> {
    let socket = supervisor.prepare_host_socket()?;
    let callbacks = host_router::<StubHost>(supervisor.clone(), EVERY_DECLARED_KEY, network)
        .route("/_host/register-job", post(accepted))
        .route("/_host/register-events", post(accepted));
    let app = Router::new().nest("/api", callbacks).with_state(host);
    let _entered = runtime.enter();
    let listener = tokio::net::UnixListener::bind(socket)?;
    runtime.spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    Ok(())
}
