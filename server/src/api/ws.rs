//! `GET /api/events`: a WebSocket streaming live [`ServerEvent`]s to a client
//! (scan progress, library/metadata updates), and carrying the one thing a
//! client sends upward: a TV attaching itself as a cast receiver.

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
    // The bus carries per-user events (notifications) alongside server-wide
    // ones, so this socket needs the id to forward only its own.
    let ip = client_ip(&headers, &addr);
    let who = Viewer {
        network: classify_network(&ip, &settings::local_networks(&state.settings)),
        can_cast: user.can(Permission::Playback),
        id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
    };
    ws.protocols([offered]).on_upgrade(move |socket| pump(socket, state, who))
}

struct Viewer {
    id: String,
    username: String,
    avatar_url: Option<String>,
    network: String,
    can_cast: bool,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum ClientMessage {
    #[serde(rename = "cast.hello")]
    CastHello {
        #[serde(rename = "receiverId")]
        receiver_id: String,
        #[serde(default)]
        name: String,
        #[serde(default)]
        platform: String,
    },
    #[serde(rename = "cast.state")]
    CastState {
        #[serde(default)]
        playback: Option<CastPlayback>,
    },
    #[serde(rename = "cast.ack")]
    CastAck { seq: u64 },
    #[serde(rename = "cast.control")]
    CastControl {
        #[serde(rename = "receiverId")]
        receiver_id: String,
        #[serde(default)]
        name: String,
    },
    #[serde(rename = "cast.release")]
    CastRelease,
    #[serde(rename = "cast.kick")]
    CastKick {
        #[serde(rename = "controllerId")]
        controller_id: String,
    },
}

async fn pump(mut socket: WebSocket, state: SharedState, who: Viewer) {
    let mut rx = state.events.subscribe();

    // Greet so the client can confirm the stream is live.
    let Ok(hello) = serde_json::to_string(&ServerEvent::Hello {
        version: env!("CARGO_PKG_VERSION"),
    }) else {
        return;
    };
    if socket.send(Message::Text(hello.into())).await.is_err() {
        return;
    }

    // Periodic ping so a half-open socket (client vanished without a Close
    // frame) is detected as a failed send rather than lingering forever.
    let mut keepalive = tokio::time::interval(std::time::Duration::from_secs(30));
    keepalive.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    keepalive.reset(); // skip the immediate first tick

    // Set once this socket attaches a TV; the roster entry lives as long as this
    // does.
    let mut receiver: Option<String> = None;
    // Minted here, not taken from the client, so the name a television shows
    // cannot be forged.
    let controller_id = crate::services::auth::random_token();
    let mut controlling = false;

    loop {
        tokio::select! {
            event = rx.recv() => match event {
                Ok(env) => {
                    // Addressed events (notifications) reach every subscriber of
                    // the single broadcast channel; `payload_for` is the audience
                    // check, dropping anything addressed to another account.
                    let Some(payload) = env.payload_for(&who.id) else {
                        continue;
                    };
                    if socket.send(Message::Text(payload.to_string().into())).await.is_err() {
                        break; // client gone
                    }
                }
                Err(RecvError::Lagged(_)) => continue,
                Err(RecvError::Closed) => break,
            },
            incoming = socket.recv() => match incoming {
                None | Some(Ok(Message::Close(_))) | Some(Err(_)) => break,
                Some(Ok(Message::Text(text))) => {
                    // Unrecognized frames are ignored, not fatal: an older server
                    // must not drop the socket of a newer client.
                    if let Ok(message) = serde_json::from_str::<ClientMessage>(&text) {
                        handle_client(
                            &state,
                            &who,
                            &mut receiver,
                            &controller_id,
                            &mut controlling,
                            message,
                        )
                        .await;
                    }
                }
                _ => {}
            },
            _ = keepalive.tick() => {
                // Doubles as the receiver's liveness: a paused film sends nothing
                // for minutes and must not age out of the roster.
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
    // immediately, rather than leaving a dead set offerable until its TTL expires.
    if let Some(id) = receiver {
        if state.cast.remove_owned(&id, &who.id) {
            state.events.publish(ServerEvent::CastReceiverGone { receiver_id: id });
        }
    }
    if controlling {
        release_controller(&state, &controller_id);
    }
}

fn cast_hello(
    state: &SharedState,
    who: &Viewer,
    receiver: &mut Option<String>,
    receiver_id: String,
    name: String,
    platform: String,
) {
    if !who.can_cast || !crate::services::cast::valid_receiver_id(&receiver_id) {
        return;
    }
    let outcome = state.cast.attach(
        Hello { receiver_id: receiver_id.clone(), name, platform },
        &who.id,
        &who.username,
        who.network.clone(),
    );
    // `Taken` and `Full` both mean "not castable": the socket stays, it just
    // carries no receiver.
    if !matches!(outcome, Announced::Ok { .. }) {
        return;
    }
    *receiver = Some(receiver_id.clone());
    if let Some(row) = state.cast.row(&receiver_id) {
        state.events.publish(ServerEvent::CastReceiverChanged { receiver: Box::new(row) });
    }
}

async fn cast_state(state: &SharedState, id: String, playback: Option<CastPlayback>) {
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
        Some(StateChange::Row(row)) => {
            state.events.publish(ServerEvent::CastReceiverChanged { receiver: Box::new(row) });
        }
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

fn release_controller(state: &SharedState, controller_id: &str) {
    for row in state.cast.detach_controller(controller_id) {
        state.events.publish(ServerEvent::CastReceiverChanged { receiver: Box::new(row) });
    }
}

async fn handle_client(
    state: &SharedState,
    who: &Viewer,
    receiver: &mut Option<String>,
    controller_id: &str,
    controlling: &mut bool,
    message: ClientMessage,
) {
    match message {
        ClientMessage::CastHello { receiver_id, name, platform } => {
            cast_hello(state, who, receiver, receiver_id, name, platform);
        }
        ClientMessage::CastState { playback } => {
            let Some(id) = receiver.clone() else { return };
            cast_state(state, id, playback).await;
        }
        ClientMessage::CastAck { seq } => {
            if let Some(id) = receiver.as_deref() {
                state.cast.ack(id, seq);
            }
        }
        ClientMessage::CastControl { receiver_id, name } => {
            if !who.can_cast {
                return;
            }
            // One socket drives one set: picking another releases the first.
            release_controller(state, controller_id);
            *controlling = true;
            if let Some(row) =
                state.cast.attach_controller(
                    &receiver_id,
                    controller_id,
                    &name,
                    &who.id,
                    &who.username,
                    who.avatar_url.as_deref(),
                )
            {
                state.events.publish(ServerEvent::CastReceiverChanged { receiver: Box::new(row) });
            }
        }
        ClientMessage::CastRelease => {
            *controlling = false;
            release_controller(state, controller_id);
        }
        ClientMessage::CastKick { controller_id } => {
            // Scoped to this receiver: a set may only kick its own remotes.
            let Some(id) = receiver.clone() else { return };
            let Some((row, user_id)) = state.cast.kick_controller(&id, &controller_id) else {
                return;
            };
            state.events.publish(ServerEvent::CastReceiverChanged { receiver: Box::new(row) });
            state
                .events
                .publish_to(&user_id, ServerEvent::CastKicked { receiver_id: id });
        }
    }
}
