//! `GET /api/events` a WebSocket that streams live [`ServerEvent`]s to a client
//! (scan progress, library/metadata updates). Clients hold it open and update
//! their UI in place; the connection survives the lifetime of the app.
//!
//! It also carries the ONE thing clients send upward: a TV attaching itself as a
//! cast receiver. That direction used to be an HTTP heartbeat every ten seconds;
//! on the socket the TV says hello once and then speaks only when something
//! changes, so a pause reaches a phone immediately instead of up to a beat late,
//! and a set that is switched off leaves the picker the moment its socket drops
//! rather than aging out of a TTL.

use std::net::SocketAddr;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use tokio::sync::broadcast::error::RecvError;

use crate::api::util::client_ip;
use crate::db;
use crate::infra::events::ServerEvent;
use crate::model::{CastPlayback, Permission};
use crate::services::cast::{Announced, Hello, StateChange};
use crate::services::playback::classify_network;
use crate::services::settings;
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
pub async fn events(
    State(state): State<SharedState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
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
    let ip = client_ip(&headers, &addr);
    let who = Viewer {
        network: classify_network(&ip, &settings::local_networks(&state.settings)),
        // Casting answers to the capability that means "may watch": a socket
        // whose account cannot stream must not be able to attach a TV either.
        can_cast: user.can(Permission::Playback),
        id: user.id,
        username: user.username,
    };
    // Echo the accepted subprotocol so the browser completes the handshake.
    ws.protocols([offered]).on_upgrade(move |socket| pump(socket, state, who))
}

/// Who is on the other end of this socket.
struct Viewer {
    id: String,
    username: String,
    /// `LAN` | `WAN`, resolved once at the handshake.
    network: String,
    can_cast: bool,
}

/// The only thing a client sends upward: a TV being a cast receiver.
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum ClientMessage {
    /// Attach this socket as a receiver (sent once, on connect).
    #[serde(rename = "cast.hello")]
    CastHello {
        #[serde(rename = "receiverId")]
        receiver_id: String,
        #[serde(default)]
        name: String,
        #[serde(default)]
        platform: String,
    },
    /// What it is playing now; `null` once it leaves the player.
    #[serde(rename = "cast.state")]
    CastState {
        #[serde(default)]
        playback: Option<CastPlayback>,
    },
    /// Everything up to `seq` has been applied.
    #[serde(rename = "cast.ack")]
    CastAck { seq: u64 },
}

async fn pump(mut socket: WebSocket, state: SharedState, who: Viewer) {
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

    // Set once this socket attaches a TV. Its lifetime IS the receiver's: the
    // roster entry goes when the loop below ends, whichever way it ends.
    let mut receiver: Option<String> = None;

    loop {
        tokio::select! {
            event = rx.recv() => match event {
                // Already serialized at publish time; per-subscriber cost is a copy.
                // Addressed events (notifications) reach every subscriber of the
                // single broadcast channel, so the audience check is what keeps
                // one user's notifications off everyone else's socket.
                Ok(env) => {
                    if !env.visible_to(&who.id) {
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
                None | Some(Ok(Message::Close(_))) | Some(Err(_)) => break,
                Some(Ok(Message::Text(text))) => {
                    // A frame we don't understand is ignored, not fatal: an older
                    // server must not drop the socket of a newer client.
                    if let Ok(message) = serde_json::from_str::<ClientMessage>(&text) {
                        handle_client(&state, &who, &mut receiver, message).await;
                    }
                }
                _ => {}
            },
            _ = keepalive.tick() => {
                // The tick doubles as the receiver's liveness: a paused film sends
                // nothing for minutes and must not age out of the roster.
                if let Some(id) = receiver.as_deref() {
                    state.cast.touch(id);
                }
                if socket.send(Message::Ping(Default::default())).await.is_err() {
                    break; // client gone
                }
            }
        }
    }

    // The socket is the presence: dropping it takes the TV out of every picker
    // now, rather than leaving a dead set offerable until its TTL expires.
    if let Some(id) = receiver {
        if state.cast.remove_owned(&id, &who.id) {
            state.events.publish(ServerEvent::CastReceiverGone { receiver_id: id });
        }
    }
}

/// Apply one upward frame. `receiver` carries the id this socket attached, so a
/// state/ack frame can only ever touch the TV this same socket registered.
async fn handle_client(
    state: &SharedState,
    who: &Viewer,
    receiver: &mut Option<String>,
    message: ClientMessage,
) {
    match message {
        ClientMessage::CastHello { receiver_id, name, platform } => {
            if !who.can_cast || !crate::services::cast::valid_receiver_id(&receiver_id) {
                return;
            }
            let outcome = state.cast.attach(
                Hello { receiver_id: receiver_id.clone(), name, platform },
                &who.id,
                &who.username,
                who.network.clone(),
            );
            // `Taken` (another account already answers to this id) and `Full` both
            // mean "not castable": the socket stays, it just carries no receiver.
            if matches!(outcome, Announced::Ok { .. }) {
                *receiver = Some(receiver_id.clone());
                if let Some(row) = state.cast.row(&receiver_id) {
                    state.events.publish(ServerEvent::CastReceiverChanged {
                        receiver: Box::new(row),
                    });
                }
            }
        }
        ClientMessage::CastState { playback } => {
            let Some(id) = receiver.clone() else { return };
            // Resolve the title once per item, exactly as the HTTP path does: the
            // receiver names an id, the catalog decides what it is.
            let item = match playback.as_ref() {
                Some(pb) if state.cast.wants_item(&id, &pb.item_id) => {
                    let pool = state.db.clone();
                    let wanted = pb.item_id.clone();
                    tokio::task::spawn_blocking(move || db::get_item(&pool, &wanted))
                        .await
                        .ok()
                        .and_then(|r| r.ok())
                        .flatten()
                }
                _ => None,
            };
            match state.cast.set_state(&id, playback, item) {
                Some(StateChange::Row(row)) => state.events.publish(ServerEvent::CastReceiverChanged {
                    receiver: Box::new(row),
                }),
                Some(StateChange::Position { position_ms, duration_ms, state: transport }) => {
                    state.events.publish(ServerEvent::CastPosition {
                        receiver_id: id,
                        position_ms,
                        duration_ms,
                        state: transport,
                    });
                }
                Some(StateChange::Nothing) | None => {}
            }
        }
        ClientMessage::CastAck { seq } => {
            if let Some(id) = receiver.as_deref() {
                state.cast.ack(id, seq);
            }
        }
    }
}
