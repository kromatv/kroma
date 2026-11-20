use serde::Deserialize;

use super::cast::{
    cast_control, cast_hello, cast_kick, cast_state, release_controller, KickOrder, Seat,
};
use super::Viewer;
use crate::model::{CastPlayback, CastWakeHint};
use crate::services::cast::Hello;
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
        #[serde(default)]
        wake: Option<CastWakeHint>,
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
            wake,
        } => {
            let hello = Hello {
                receiver_id,
                name,
                platform,
            };
            cast_hello(state, who, receiver, hello, wake);
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
        ClientMessage::Control { receiver_id, name } if who.can_cast => {
            *controlling = true;
            let controller_id = controller_id.to_string();
            cast_control(
                state,
                who,
                Seat {
                    controller_id,
                    receiver_id,
                    name,
                },
            );
        }
        ClientMessage::Control { .. } => {}
        ClientMessage::Release => {
            *controlling = false;
            release_controller(state, controller_id);
        }
        ClientMessage::Kick { controller_id } => {
            let Some(receiver_id) = receiver.clone() else {
                return;
            };
            cast_kick(
                state,
                who,
                KickOrder {
                    receiver_id,
                    controller_id,
                },
            );
        }
    }
}
