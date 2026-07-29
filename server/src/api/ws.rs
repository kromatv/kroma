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
        // So a television can show WHOSE remote just took it, not only what
        // model of phone it is.
        avatar_url: user.avatar_url,
    };
    // Echo the accepted subprotocol so the browser completes the handshake.
    ws.protocols([offered]).on_upgrade(move |socket| pump(socket, state, who))
}

/// Who is on the other end of this socket.
struct Viewer {
    id: String,
    username: String,
    avatar_url: Option<String>,
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
    /// This SENDER is now driving a receiver: it holds its remote, and the
    /// television lists it until this socket goes away.
    #[serde(rename = "cast.control")]
    CastControl {
        #[serde(rename = "receiverId")]
        receiver_id: String,
        #[serde(default)]
        name: String,
    },
    /// It stopped driving (picked another device, or went back to playing here).
    #[serde(rename = "cast.release")]
    CastRelease,
    /// The RECEIVER disconnects one of its remotes. Only a socket that owns the
    /// receiver may do this - a remote cannot evict another remote.
    #[serde(rename = "cast.kick")]
    CastKick {
        #[serde(rename = "controllerId")]
        controller_id: String,
    },
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
    // This socket's identity AS A REMOTE, minted here rather than taken from the
    // client so the name a television shows cannot be forged. Only meaningful
    // once the socket says `cast.control`.
    let controller_id = crate::services::auth::random_token();
    let mut controlling = false;

    loop {
        tokio::select! {
            event = rx.recv() => match event {
                // Already serialized at publish time; per-subscriber cost is a copy.
                // Addressed events (notifications) reach every subscriber of the
                // single broadcast channel, so the audience check is what keeps
                // one user's notifications off everyone else's socket.
                Ok(env) => {
                    // `payload_for` IS the audience check: an event addressed to
                    // another account yields None and is dropped here.
                    let Some(payload) = env.payload_for(&who.id) else {
                        continue;
                    };
                    if socket.send(Message::Text(payload.to_string().into())).await.is_err() {
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
    // ...and a remote that walks out of the room leaves the television's list.
    if controlling {
        release_controller(&state, &controller_id);
    }
}

/// A television announcing itself on its socket.
///
/// Its own function, like [`cast_state`], because `handle_client` is a router:
/// once an arm grows a guard, a fallible attach and a conditional broadcast, the
/// routing stops being readable through it.
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
    // `Taken` (another account already answers to this id) and `Full` both mean
    // "not castable": the socket stays, it just carries no receiver.
    if !matches!(outcome, Announced::Ok { .. }) {
        return;
    }
    *receiver = Some(receiver_id.clone());
    if let Some(row) = state.cast.row(&receiver_id) {
        state.events.publish(ServerEvent::CastReceiverChanged { receiver: Box::new(row) });
    }
}

/// One heartbeat from a television: what it is playing, and how much of that
/// senders need to be told about.
async fn cast_state(state: &SharedState, id: String, playback: Option<CastPlayback>) {
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

/// Take this socket's remote off whatever set it was driving, and say so.
///
/// The mutation and the broadcast are one act: a controller roster that changes
/// without the event leaves every phone's picker and every television's remote
/// list stale until the TTL sweep notices. Writing the pair once is what stops
/// the next caller from doing only half of it.
fn release_controller(state: &SharedState, controller_id: &str) {
    for row in state.cast.detach_controller(controller_id) {
        state.events.publish(ServerEvent::CastReceiverChanged { receiver: Box::new(row) });
    }
}

/// Apply one upward frame. `receiver` carries the id this socket attached, so a
/// state/ack frame can only ever touch the TV this same socket registered.
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
            // One socket drives one set: picking another releases the first, so a
            // television never lists a phone that has moved on.
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
            // Only the set itself may send its remotes away - and only its OWN,
            // which is why the registry does the removal scoped to this receiver
            // rather than by controller id alone.
            let Some(id) = receiver.clone() else { return };
            let Some((row, user_id)) = state.cast.kick_controller(&id, &controller_id) else {
                return;
            };
            state.events.publish(ServerEvent::CastReceiverChanged { receiver: Box::new(row) });
            // Tell the remote it was let go, so it stops showing a set it no
            // longer drives. Addressed: nobody else's phone hears it.
            state
                .events
                .publish_to(&user_id, ServerEvent::CastKicked { receiver_id: id });
        }
    }
}
