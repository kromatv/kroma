use axum::extract::ws::{Message, WebSocket};
use tokio::sync::broadcast::error::RecvError;

use super::cast::release_controller;
use super::message::{handle_client, ClientMessage};
use super::Viewer;
use crate::infra::events::ServerEvent;
use crate::state::SharedState;

pub(super) async fn pump(mut socket: WebSocket, state: SharedState, who: Viewer) {
    let mut rx = state.events.subscribe();

    let Ok(hello) = serde_json::to_string(&ServerEvent::Hello {
        version: crate::VERSION,
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
    let mut answered = true;

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
                        break;
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
                Some(Ok(Message::Pong(_))) => answered = true,
                _ => {}
            },
            _ = keepalive.tick() => {
                if !answered {
                    break;
                }
                // Doubles as the receiver's liveness: a paused film sends nothing
                // for minutes and must not age out of the roster.
                if let Some(id) = receiver.as_deref() {
                    state.cast.touch(id);
                }
                answered = false;
                if socket.send(Message::Ping(Default::default())).await.is_err() {
                    break;
                }
            }
        }
    }

    // The socket is the presence: dropping it takes the TV out of every picker
    // immediately, rather than leaving a dead set offerable until its TTL expires.
    if let Some(id) = receiver {
        if state.cast.remove_owned(&id, &who.id) {
            state
                .events
                .publish_to(&who.id, ServerEvent::CastReceiverGone { receiver_id: id });
        }
    }
    if controlling {
        release_controller(&state, &controller_id);
    }
}
