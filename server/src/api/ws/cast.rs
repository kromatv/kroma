use super::Viewer;
use crate::api::cast::{arrived, publish_all_issued, Heard, Issued};
use crate::db;
use crate::infra::events::ServerEvent;
use crate::model::{CastPlayback, CastReceiver, CastWakeHint, MediaItem};
use crate::services::cast::{Announced, Hello, StateChange};
use crate::state::SharedState;

pub(super) struct Seat {
    pub controller_id: String,
    pub receiver_id: String,
    pub name: String,
}

pub(super) struct KickOrder {
    pub receiver_id: String,
    pub controller_id: String,
}

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
    let Announced::Ok { commands, .. } = outcome else {
        return;
    };
    *receiver = Some(receiver_id.clone());
    if let Some(row) = state.cast.row(&receiver_id) {
        let heard = Heard {
            user_id: &who.id,
            peer: &who.ip,
            row,
            hint: wake,
        };
        arrived(state, heard);
    }
    let to = Issued {
        user_id: &who.id,
        receiver_id: &receiver_id,
    };
    publish_all_issued(state, to, commands);
}

async fn resolved_item(
    state: &SharedState,
    id: &str,
    playback: Option<&CastPlayback>,
) -> Option<MediaItem> {
    let pb = playback.filter(|pb| state.cast.wants_item(id, &pb.item_id))?;
    let pool = state.db.clone();
    let wanted = pb.item_id.clone();
    tokio::task::spawn_blocking(move || db::get_item(&pool, &wanted))
        .await
        .ok()
        .and_then(|r| r.ok())
        .flatten()
}

pub(super) async fn cast_state(
    state: &SharedState,
    owner: &str,
    id: String,
    playback: Option<CastPlayback>,
) {
    let item = resolved_item(state, &id, playback.as_ref()).await;
    match state.cast.set_state(&id, playback, item) {
        Some(StateChange::Row(row)) => publish_row(state, owner, row),
        Some(StateChange::Position {
            position_ms,
            duration_ms,
            buffered_ms,
            state: transport,
        }) => {
            let beat = ServerEvent::CastPosition {
                receiver_id: id,
                position_ms,
                duration_ms,
                buffered_ms,
                state: transport,
            };
            state.events.publish_to(owner, beat);
        }
        Some(StateChange::Nothing) | None => {}
    }
}

fn publish_row(state: &SharedState, owner: &str, row: Box<CastReceiver>) {
    state
        .events
        .publish_to(owner, ServerEvent::CastReceiverChanged { receiver: row });
}

pub(super) fn cast_control(state: &SharedState, who: &Viewer, seat: Seat) {
    release_controller(state, &seat.controller_id);
    let row = state.cast.attach_controller(
        &seat.receiver_id,
        &seat.controller_id,
        &seat.name,
        &who.id,
        &who.username,
        who.avatar_url.as_deref(),
    );
    if let Some(row) = row {
        publish_row(state, &who.id, Box::new(row));
    }
}

pub(super) fn cast_kick(state: &SharedState, who: &Viewer, order: KickOrder) {
    let kicked = state
        .cast
        .kick_controller(&order.receiver_id, &order.controller_id);
    let Some((row, user_id)) = kicked else {
        return;
    };
    publish_row(state, &who.id, Box::new(row));
    let gone = ServerEvent::CastKicked {
        receiver_id: order.receiver_id,
    };
    state.events.publish_to(&user_id, gone);
}

pub(super) fn release_controller(state: &SharedState, controller_id: &str) {
    for (owner, row) in state.cast.detach_controller(controller_id) {
        publish_row(state, &owner, Box::new(row));
    }
}
