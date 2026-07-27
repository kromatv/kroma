//! `GET /api/events` a WebSocket that streams live [`ServerEvent`]s to a client
//! (scan progress, library/metadata updates). Clients hold it open and update
//! their UI in place; the connection survives the lifetime of the app.

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use tokio::sync::broadcast::error::RecvError;

use crate::infra::events::ServerEvent;
use crate::state::SharedState;
use axum::routing::get;
use axum::Router;

/// Subprotocol prefix the client uses to carry its session bearer on the upgrade.
const SESSION_PROTO_PREFIX: &str = "kroma.session.";

/// `GET /api/events` (WebSocket upgrade for the live event bus).
pub fn routes() -> Router<SharedState> {
    Router::new().route("/events", get(events))
}

/// Authenticate the WebSocket upgrade, then stream events. A browser can't set
/// request headers on a WS handshake, so the client passes its session bearer as
/// a WebSocket subprotocol (`kroma.session.<token>`); we validate it against the
/// `sessions` table and echo the subprotocol back so the handshake completes.
///
/// Without this the event bus streams to anyone who can reach the server: it
/// carries job-log lines, library/playback activity and download/VPN status, and
/// (being exempt from the browser same-origin policy) an unauthenticated bus is
/// also open to cross-site WebSocket hijacking from any page the victim visits.
pub async fn events(State(state): State<SharedState>, headers: HeaderMap, ws: WebSocketUpgrade) -> Response {
    let Some(offered) = headers
        .get(axum::http::header::SEC_WEBSOCKET_PROTOCOL)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').map(str::trim).find(|p| p.starts_with(SESSION_PROTO_PREFIX)))
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
    // Keep the id: the bus carries per-user events (notifications) alongside the
    // server-wide ones, and this socket may only forward its own.
    let viewer = user.id;
    // Echo the accepted subprotocol so the browser completes the handshake.
    ws.protocols([offered]).on_upgrade(move |socket| pump(socket, state, viewer))
}

async fn pump(mut socket: WebSocket, state: SharedState, viewer: String) {
    let mut rx = state.events.subscribe();

    // Greet so the client can confirm the stream is live. Serialization of a
    // fixed struct can't realistically fail, but if it ever did we'd rather drop
    // the connection than send an empty frame.
    let Ok(hello) = serde_json::to_string(&ServerEvent::Hello {
        version: env!("CARGO_PKG_VERSION"),
    }) else {
        return;
    };
    if socket.send(Message::Text(hello.into())).await.is_err() {
        return;
    }

    // Periodic ping so a half-open socket (client vanished without a Close frame)
    // is detected as a failed send rather than lingering forever.
    let mut keepalive = tokio::time::interval(std::time::Duration::from_secs(30));
    keepalive.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    keepalive.reset(); // skip the immediate first tick

    loop {
        tokio::select! {
            event = rx.recv() => match event {
                // Already serialized at publish time; per-subscriber cost is a copy.
                // Addressed events (notifications) reach every subscriber of the
                // single broadcast channel, so the audience check is what keeps
                // one user's notifications off everyone else's socket.
                Ok(env) => {
                    if !env.visible_to(&viewer) {
                        continue;
                    }
                    if socket.send(Message::Text(env.json.to_string().into())).await.is_err() {
                        break; // client gone
                    }
                }
                // Slow client fell behind; skip the dropped events and continue.
                Err(RecvError::Lagged(_)) => continue,
                Err(RecvError::Closed) => break,
            },
            incoming = socket.recv() => match incoming {
                // We don't expect client messages; just detect disconnect.
                None | Some(Ok(Message::Close(_))) | Some(Err(_)) => break,
                _ => {}
            },
            _ = keepalive.tick() => {
                if socket.send(Message::Ping(Default::default())).await.is_err() {
                    break; // client gone
                }
            }
        }
    }
}
