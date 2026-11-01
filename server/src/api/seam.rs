//! The host callbacks on both doors: on the core's own Unix socket, for any
//! token the supervisor minted; on the TCP listener, for a module on the legacy
//! seam only.

use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::{ConnectInfo, Request, State};
use axum::http::StatusCode;
use axum::middleware::{from_fn_with_state, Next};
use axum::response::Response;
use axum::{Extension, Router};
use kroma_module_supervisor::Supervisor;
use tower_http::trace::TraceLayer;

use super::{host_events, host_jobs, module_proxy};
use crate::api::error::json_error;
use crate::api::extract::bearer_from_headers;
use crate::state::SharedState;

/// The router on the core's own Unix socket, where a module on the socket seam
/// calls back: the host callbacks and the reverse proxy to a peer module, and
/// none of the routes a client of the server reaches.
pub fn router(
    state: SharedState,
    supervisor: Arc<Supervisor>,
    subscriptions: Arc<host_events::Subscriptions>,
) -> Router {
    let api = host_routes(&state, &supervisor, &subscriptions)
        .route("/module/{id}/{*rest}", axum::routing::any(module_proxy))
        .layer(Extension(supervisor));
    Router::new()
        .nest("/api", api)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

pub(super) fn tcp_host_routes(
    state: &SharedState,
    supervisor: &Arc<Supervisor>,
    subscriptions: &Arc<host_events::Subscriptions>,
) -> Router<SharedState> {
    host_routes(state, supervisor, subscriptions).layer(from_fn_with_state(
        supervisor.clone(),
        legacy_host_callers_only,
    ))
}

fn host_routes(
    state: &SharedState,
    supervisor: &Arc<Supervisor>,
    subscriptions: &Arc<host_events::Subscriptions>,
) -> Router<SharedState> {
    kroma_module_supervisor::host_router::<SharedState>(
        supervisor.clone(),
        kroma_module_host::SettingReachOf(crate::services::settings::reach_of_setting),
        kroma_module_host::NetworkPolicyOf(state.network.clone()),
    )
    .merge(host_jobs::routes())
    .merge(host_events::routes(
        supervisor.clone(),
        subscriptions.clone(),
    ))
}

async fn legacy_host_callers_only(
    State(supervisor): State<Arc<Supervisor>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req: Request,
    next: Next,
) -> Response {
    let relayed = RELAY_HEADERS
        .iter()
        .any(|name| req.headers().contains_key(*name));
    let legacy =
        bearer_from_headers(req.headers()).is_some_and(|bearer| supervisor.legacy_caller(&bearer));
    if addr.ip().to_canonical().is_loopback() && !relayed && legacy {
        next.run(req).await
    } else {
        json_error(StatusCode::NOT_FOUND, "not found")
    }
}

const RELAY_HEADERS: [&str; 6] = [
    "forwarded",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-real-ip",
    "cf-connecting-ip",
    "cdn-loop",
];

#[cfg(test)]
mod tests {
    use axum::http::StatusCode;

    use crate::api::test_support::{raw, test_app, text};

    #[tokio::test]
    async fn the_module_socket_answers_none_of_the_routes_a_client_reaches() {
        let t = test_app();
        let client_routes = [
            ("GET", "/api/auth/config"),
            ("POST", "/api/handoff/announce"),
            ("POST", "/api/handoff/poll"),
            ("GET", "/api/handoff/devices"),
            ("GET", "/api/movies"),
            ("GET", "/api/admin/modules"),
        ];

        for (method, path) in client_routes {
            let (on_web, _, _) = raw(&t.app, method, path, Some(&t.token), None, &[]).await;
            let (on_seam, _, _) = raw(&t.seam, method, path, Some(&t.token), None, &[]).await;

            assert_ne!(
                on_web,
                StatusCode::NOT_FOUND,
                "{method} {path} on the web listener"
            );
            assert_eq!(
                on_seam,
                StatusCode::NOT_FOUND,
                "{method} {path} on the module socket"
            );
        }
    }

    #[tokio::test]
    async fn the_module_socket_serves_the_host_callbacks_and_the_peer_proxy() {
        let t = test_app();

        let (callback, _, _) = raw(
            &t.seam,
            "GET",
            "/api/_host/setting?key=serverName&kind=str&default=",
            Some("test-host-token"),
            None,
            &[],
        )
        .await;
        let (proxy, body) = text(
            &t.seam,
            "GET",
            "/api/module/com.example.absent/_health",
            None,
            None,
        )
        .await;

        assert_eq!(callback, StatusCode::OK);
        assert_eq!(
            (proxy, body.as_str()),
            (StatusCode::NOT_FOUND, "module not running")
        );
    }
}
