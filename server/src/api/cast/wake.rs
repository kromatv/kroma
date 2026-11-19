//! `/api/cast/receivers/:id/wake`: bring back a television that is off, and
//! forget how to.

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
use crate::infra::events::ServerEvent;
use crate::model::{CastCommand, CastWakeStep, Permission, User};
use crate::services::cast::{valid_receiver_id, wake};
use crate::state::SharedState;

use super::bad_id;
use super::command::known_title;

#[derive(Debug, Default, Deserialize)]
pub struct WakeBody {
    /// What to start once the television is back. Only a `play` is held.
    #[serde(default)]
    pub play: Option<CastCommand>,
}

/// The steps for the caller to run from where it is. The server runs none: it
/// may be anywhere, and never reaches a television.
#[derive(Debug, Serialize)]
pub struct WakeReply {
    pub steps: Vec<CastWakeStep>,
}

fn gone(user: &User) -> Response {
    lerr(
        i18n::user_locale(user),
        StatusCode::NOT_FOUND,
        "error.castReceiverGone",
    )
}

/// `POST /api/cast/receivers/:id/wake` (Bearer) `{ play? }` → `WakeReply`.
/// Owner-scoped like every cast route: a television the caller does not keep
/// answers exactly like one nobody keeps. A television that is already there
/// is handed the order at once and has no steps to run.
pub async fn wake(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    body: Option<Json<WakeBody>>,
) -> Result<Response, Response> {
    require(&user, Permission::Playback)?;
    if !valid_receiver_id(&id) {
        return Err(bad_id(&user));
    }
    let play = body
        .and_then(|Json(body)| body.play)
        .filter(|command| matches!(command, CastCommand::Play { .. }));
    if let Some(command) = &play {
        known_title(&state, &user, command).await?;
    }

    if state.cast.may_command(&id, &user.id).is_some() {
        hand_over(&state, &user, &id, play);
        return Ok(Json(WakeReply { steps: Vec::new() }).into_response());
    }

    let (wanted, owner) = (id.clone(), user.id.clone());
    let device = query(&state.db, move |pool| {
        db::cast_device(&pool, &wanted, &owner)
    })
    .await
    .unwrap_or_default()
    .ok_or_else(|| gone(&user))?;
    let steps = wake::plan(&device);
    if steps.is_empty() {
        return Err(gone(&user));
    }

    if let Some(command) = play {
        state.cast.hold(&id, &user.id, command);
    }
    Ok(Json(WakeReply { steps }).into_response())
}

fn hand_over(state: &SharedState, user: &User, id: &str, play: Option<CastCommand>) {
    let Some(command) = play else {
        return;
    };
    let Some(envelope) = state.cast.enqueue(id, &user.id, command) else {
        return;
    };
    state.events.publish_to(
        &user.id,
        ServerEvent::CastCommandIssued {
            receiver_id: id.to_string(),
            seq: envelope.seq,
            command: envelope.command,
        },
    );
}

/// `DELETE /api/cast/receivers/:id/wake` (Bearer) → 204. Stop listing a
/// television that is off. Owner-scoped, and a no-op for anything else.
pub async fn forget(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    require(&user, Permission::Playback)?;
    let owner = user.id.clone();
    let _ = query(&state.db, move |pool| {
        db::forget_cast_device(&pool, &id, &owner)
    })
    .await;
    Ok(StatusCode::NO_CONTENT.into_response())
}
