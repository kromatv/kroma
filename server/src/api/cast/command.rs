//! `POST /api/cast/receivers/:id/command`: a sender's order to a receiver it
//! drives, checked against what it names before the receiver is handed it.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::permission::require;
use crate::api::util::query;
use crate::db;
use crate::i18n;
use crate::model::{CastCommand, Permission, User};
use crate::services::cast::valid_receiver_id;
use crate::state::SharedState;

use super::{bad_id, publish_issued, Issued};

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
    require(&user, Permission::Playback)?;
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
    known_title(&state, &user, &body.command).await?;

    let Some(envelope) = state.cast.enqueue(&id, &user.id, body.command) else {
        return Err(lerr(
            i18n::user_locale(&user),
            StatusCode::NOT_FOUND,
            "error.castReceiverGone",
        ));
    };

    let seq = envelope.seq;
    let to = Issued {
        user_id: &user.id,
        receiver_id: &id,
    };
    publish_issued(&state, to, envelope);
    Ok(Json(CommandReply { seq }).into_response())
}

/// Refuses a `play` that names a title the caller cannot see, so a television
/// is never handed an id the server did not recognize. Any other order passes.
pub(super) async fn known_title(
    state: &SharedState,
    user: &User,
    command: &CastCommand,
) -> Result<(), Response> {
    let CastCommand::Play { item_id, .. } = command else {
        return Ok(());
    };
    let wanted = item_id.clone();
    let known = query(&state.db, move |pool| db::get_item(&pool, &wanted))
        .await
        .unwrap_or_default()
        .filter(|item| user.sees_library(&item.library))
        .is_some();
    if known {
        return Ok(());
    }
    Err(lerr(
        i18n::user_locale(user),
        StatusCode::NOT_FOUND,
        "error.itemNotFound",
    ))
}
