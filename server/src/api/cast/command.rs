//! `POST /api/cast/receivers/:id/command`: a sender's order to a receiver it
//! drives, checked against what it names before the receiver is handed it.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::i18n;
use crate::infra::events::ServerEvent;
use crate::model::CastCommand;
use crate::services::cast::valid_receiver_id;
use crate::state::SharedState;

use super::{bad_id, require_playback};

#[derive(Debug, Deserialize)]
pub struct CommandBody {
    #[serde(flatten)]
    pub command: CastCommand,
}

#[derive(Debug, Serialize)]
pub struct CommandReply {
    pub seq: u64,
}

/// `POST /api/cast/receivers/:id/command` (Bearer) `{ type, ... }` → `{ seq }`.
/// Owner-scoped: only the account the receiver is signed into may drive it, and
/// anybody else's receiver answers exactly like a missing one. A `play` is
/// checked against the catalog first, so the TV is never handed an id the server
/// did not recognize.
pub async fn command(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<CommandBody>,
) -> Result<Response, Response> {
    require_playback(&user)?;
    if !valid_receiver_id(&id) {
        return Err(bad_id(&user));
    }
    // `None` covers absent, dead and foreign alike; answering all three with the
    // same 404 keeps the roster unprobable. Only a kick, which already implies
    // the set is the caller's own, is a refusal.
    match state.cast.may_command(&id, &user.id) {
        Some(true) => {}
        Some(false) => {
            return Err(lerr(
                i18n::user_locale(&user),
                StatusCode::FORBIDDEN,
                "error.forbidden",
            ))
        }
        None => {
            return Err(lerr(
                i18n::user_locale(&user),
                StatusCode::NOT_FOUND,
                "error.castReceiverGone",
            ))
        }
    }
    if let CastCommand::Play { item_id, .. } = &body.command {
        let wanted = item_id.clone();
        let known = query(&state.db, move |pool| db::get_item(&pool, &wanted))
            .await
            .unwrap_or_default()
            .filter(|item| user.sees_library(&item.library))
            .is_some();
        if !known {
            return Err(lerr(
                i18n::user_locale(&user),
                StatusCode::NOT_FOUND,
                "error.itemNotFound",
            ));
        }
    }

    let Some(envelope) = state.cast.enqueue(&id, &user.id, body.command) else {
        return Err(lerr(
            i18n::user_locale(&user),
            StatusCode::NOT_FOUND,
            "error.castReceiverGone",
        ));
    };

    // Addressed to the caller's own account, the only one the receiver can
    // belong to here, so no other household's clients ever see it.
    state.events.publish_to(
        &user.id,
        ServerEvent::CastCommandIssued {
            receiver_id: id,
            seq: envelope.seq,
            command: envelope.command,
        },
    );
    Ok(Json(CommandReply { seq: envelope.seq }).into_response())
}
