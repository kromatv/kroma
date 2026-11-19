use super::Viewer;
use crate::db;
use crate::infra::events::ServerEvent;
use crate::model::{CastPlayback, CastWakeHint};
use crate::services::cast::{Announced, Hello, StateChange};
use crate::state::SharedState;

pub(super) fn cast_hello(
    state: &SharedState,
    who: &Viewer,
    receiver: &mut Option<String>,
    hello: Hello,
    wake: Option<CastWakeHint>,
) {
    if !who.can_cast || !crate::services::cast::valid_receiver_id(&hello.receiver_id) {
        return;
    }
    let receiver_id = hello.receiver_id.clone();
    let outcome = state
        .cast
        .attach(hello, &who.id, &who.username, who.network.clone());
    // `Taken` and `Full` both mean "not castable": the socket stays, it just
    // carries no receiver.
    let Announced::Ok { commands, .. } = outcome else {
        return;
    };
    *receiver = Some(receiver_id.clone());
    if let Some(row) = state.cast.row(&receiver_id) {
        crate::api::cast::keep(state, &who.id, &who.ip, row.clone(), wake);
        state.events.publish_to(
            &who.id,
            ServerEvent::CastReceiverChanged {
                receiver: Box::new(row),
            },
        );
    }
    for envelope in commands {
        state.events.publish_to(
            &who.id,
            ServerEvent::CastCommandIssued {
                receiver_id: receiver_id.clone(),
                seq: envelope.seq,
                command: envelope.command,
            },
        );
    }
}

pub(super) async fn cast_state(
    state: &SharedState,
    owner: &str,
    id: String,
    playback: Option<CastPlayback>,
) {
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
            state
                .events
                .publish_to(owner, ServerEvent::CastReceiverChanged { receiver: row });
        }
        Some(StateChange::Position {
            position_ms,
            duration_ms,
            state: transport,
        }) => {
            state.events.publish_to(
                owner,
                ServerEvent::CastPosition {
                    receiver_id: id,
                    position_ms,
                    duration_ms,
                    state: transport,
                },
            );
        }
        Some(StateChange::Nothing) | None => {}
    }
}

pub(super) fn release_controller(state: &SharedState, controller_id: &str) {
    for (owner, row) in state.cast.detach_controller(controller_id) {
        state.events.publish_to(
            &owner,
            ServerEvent::CastReceiverChanged {
                receiver: Box::new(row),
            },
        );
    }
}
