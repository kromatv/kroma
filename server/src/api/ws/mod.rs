//! `GET /api/events`: a WebSocket streaming live [`ServerEvent`]s to a client
//! (scan progress, library/metadata updates), and carrying the one thing a
//! client sends upward: a TV attaching itself as a cast receiver.

mod cast;
mod connection;
mod message;

use std::net::SocketAddr;

use axum::extract::ws::WebSocketUpgrade;
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;

use crate::api::util::client_ip;
use crate::model::Permission;
use crate::services::playback::classify_network;
use crate::services::settings;
use crate::state::SharedState;

const SESSION_PROTO_PREFIX: &str = "kroma.session.";

/// `GET /api/events` (WebSocket upgrade for the live event bus).
pub fn routes() -> Router<SharedState> {
    Router::new().route("/events", get(events))
}

/// A browser can't set request headers on a WS handshake, so the client passes
/// its session bearer as a WebSocket subprotocol (`kroma.session.<token>`).
/// Without it the bus would leak activity to anyone reaching the server, and
/// (being exempt from same-origin policy) be open to cross-site WS hijacking.
pub async fn events(
    State(state): State<SharedState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    let Some(offered) = headers
        .get(axum::http::header::SEC_WEBSOCKET_PROTOCOL)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| {
            v.split(',')
                .map(str::trim)
                .find(|p| p.starts_with(SESSION_PROTO_PREFIX))
        })
        .map(str::to_string)
    else {
        return (StatusCode::UNAUTHORIZED, "authentication required").into_response();
    };
    let token = offered[SESSION_PROTO_PREFIX.len()..].to_string();
    let pool = state.db.clone();
    let user = tokio::task::spawn_blocking(move || crate::db::session_user(&pool, &token))
        .await
        .ok()
        .and_then(|r| r.ok())
        .flatten();
    let Some(user) = user else {
        return (StatusCode::UNAUTHORIZED, "invalid or expired session").into_response();
    };
    // The bus carries per-user events (notifications) alongside server-wide
    // ones, so this socket needs the id to forward only its own.
    let ip = client_ip(&headers, &addr, &state.config.trusted_proxies);
    let who = Viewer {
        network: classify_network(&ip, &settings::local_networks(&state.settings)),
        can_cast: user.can(Permission::Playback),
        id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
    };
    ws.protocols([offered])
        .on_upgrade(move |socket| connection::pump(socket, state, who))
}

struct Viewer {
    id: String,
    username: String,
    avatar_url: Option<String>,
    network: String,
    can_cast: bool,
}
