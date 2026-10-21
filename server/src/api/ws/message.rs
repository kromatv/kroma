use serde::Deserialize;

use super::cast::{cast_hello, cast_state, release_controller};
use super::Viewer;
use crate::infra::events::ServerEvent;
use crate::model::CastPlayback;
use crate::state::SharedState;

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub(super) enum ClientMessage {
    #[serde(rename = "cast.hello")]
    Hello {
        #[serde(rename = "receiverId")]
        receiver_id: String,
        #[serde(default)]
        name: String,
        #[serde(default)]
        platform: String,
    },
    #[serde(rename = "cast.state")]
    State {
        #[serde(default)]
        playback: Option<CastPlayback>,
    },
    #[serde(rename = "cast.ack")]
    Ack { seq: u64 },
    #[serde(rename = "cast.control")]
    Control {
        #[serde(rename = "receiverId")]
        receiver_id: String,
        #[serde(default)]
        name: String,
    },
    #[serde(rename = "cast.release")]
    Release,
    #[serde(rename = "cast.kick")]
    Kick {
        #[serde(rename = "controllerId")]
        controller_id: String,
    },
}

pub(super) async fn handle_client(
    state: &SharedState,
    who: &Viewer,
    receiver: &mut Option<String>,
    controller_id: &str,
    controlling: &mut bool,
    message: ClientMessage,
) {
    match message {
        ClientMessage::Hello {
            receiver_id,
            name,
            platform,
        } => {
            cast_hello(state, who, receiver, receiver_id, name, platform);
        }
        ClientMessage::State { playback } => {
            let Some(id) = receiver.clone() else { return };
            cast_state(state, &who.id, id, playback).await;
        }
        ClientMessage::Ack { seq } => {
            if let Some(id) = receiver.as_deref() {
                state.cast.ack(id, seq);
            }
        }
        ClientMessage::Control { receiver_id, name } => {
            if !who.can_cast {
                return;
            }
            // One socket drives one set: picking another releases the first.
            release_controller(state, controller_id);
            *controlling = true;
            // Refused silently for another account's set: only the account a
            // receiver is signed into may pick it up.
            if let Some(row) = state.cast.attach_controller(
                &receiver_id,
                controller_id,
                &name,
                &who.id,
                &who.username,
                who.avatar_url.as_deref(),
            ) {
                state.events.publish_to(
                    &who.id,
                    ServerEvent::CastReceiverChanged {
                        receiver: Box::new(row),
                    },
                );
            }
        }
        ClientMessage::Release => {
            *controlling = false;
            release_controller(state, controller_id);
        }
        ClientMessage::Kick { controller_id } => {
            // Scoped to this receiver: a set may only kick its own remotes.
            let Some(id) = receiver.clone() else { return };
            let Some((row, user_id)) = state.cast.kick_controller(&id, &controller_id) else {
                return;
            };
            state.events.publish_to(
                &who.id,
                ServerEvent::CastReceiverChanged {
                    receiver: Box::new(row),
                },
            );
            state
                .events
                .publish_to(&user_id, ServerEvent::CastKicked { receiver_id: id });
        }
    }
}
