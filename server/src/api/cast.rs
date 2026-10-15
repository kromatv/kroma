//! `/api/cast`: a sender (phone, browser) drives playback on a receiver (the TV)
//! with the server as rendezvous. A receiver normally rides the event socket
//! (`api::ws`); `/cast/announce` is its fallback when that socket is down.

use std::net::SocketAddr;

use axum::extract::{ConnectInfo, Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::util::{client_ip, query};
use crate::db;
use crate::i18n;
use crate::infra::events::ServerEvent;
use crate::model::{CastCommandEnvelope, CastPlayback, CastState, Permission, User};
use crate::services::cast::{valid_receiver_id, Announce, Announced};
use crate::services::playback::classify_network;
use crate::services::settings;
use crate::state::SharedState;

mod command;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/cast/announce", post(announce))
        .route("/cast/receivers", get(list))
        .route("/cast/receivers/{id}", delete(unregister))
        .route("/cast/receivers/{id}/command", post(command::command))
}

fn require_playback(user: &User) -> Result<(), Response> {
    if user.can(Permission::Playback) {
        Ok(())
    } else {
        Err(lerr(
            i18n::user_locale(user),
            StatusCode::FORBIDDEN,
            "error.permissionDenied",
        ))
    }
}

fn bad_id(user: &User) -> Response {
    lerr(
        i18n::user_locale(user),
        StatusCode::BAD_REQUEST,
        "error.castBadReceiver",
    )
}

#[derive(Debug, Deserialize)]
pub struct AnnounceBody {
    #[serde(rename = "receiverId")]
    pub receiver_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub platform: String,
    #[serde(rename = "lastAppliedSeq", default)]
    pub last_applied_seq: u64,
    #[serde(default)]
    pub playback: Option<CastPlayback>,
}

/// `POST /api/cast/announce` response: pending commands (oldest first) and the
/// heartbeat interval after which the receiver drops off the roster.
#[derive(Debug, Serialize)]
pub struct AnnounceReply {
    pub commands: Vec<CastCommandEnvelope>,
    #[serde(rename = "ttlSecs")]
    pub ttl_secs: u64,
}

/// `POST /api/cast/announce` (Bearer) → `AnnounceReply`. Register, heartbeat, ack
/// and collect in one call, for a receiver whose event socket is down.
pub async fn announce(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<AnnounceBody>,
) -> Result<Response, Response> {
    require_playback(&user)?;
    if !valid_receiver_id(&body.receiver_id) {
        return Err(bad_id(&user));
    }

    let ip = client_ip(&headers, &addr, &state.config.trusted_proxies);
    let network = classify_network(&ip, &settings::local_networks(&state.settings));

    // Resolved server-side: senders must render a title the receiver cannot spoof.
    let item = match body.playback.as_ref() {
        Some(pb) if state.cast.wants_item(&body.receiver_id, &pb.item_id) => {
            let id = pb.item_id.clone();
            query(&state.db, move |pool| db::get_item(&pool, &id))
                .await
                .unwrap_or_default()
        }
        _ => None,
    };

    let position = body
        .playback
        .as_ref()
        .map(|p| (p.position_ms.max(0), p.duration_ms, p.state));
    let outcome = state.cast.announce(
        Announce {
            receiver_id: body.receiver_id.clone(),
            name: body.name,
            platform: body.platform,
            last_applied_seq: body.last_applied_seq,
            playback: body.playback,
        },
        &user.id,
        &user.username,
        network,
        item,
    );

    let commands = match outcome {
        Announced::Ok { commands, changed } => {
            if changed {
                if let Some(row) = state.cast.row(&body.receiver_id) {
                    state.events.publish_to(
                        &user.id,
                        ServerEvent::CastReceiverChanged {
                            receiver: Box::new(row),
                        },
                    );
                }
            }
            if let Some((position_ms, duration_ms, cast_state)) = position {
                if !changed && cast_state != CastState::Idle {
                    state.events.publish_to(
                        &user.id,
                        ServerEvent::CastPosition {
                            receiver_id: body.receiver_id.clone(),
                            position_ms,
                            duration_ms,
                            state: cast_state,
                        },
                    );
                }
            }
            commands
        }
        // Refusing a taken id, rather than seizing it, is what stops an account
        // impersonating another's TV to collect the commands meant for it.
        Announced::Taken => {
            return Err(lerr(
                i18n::user_locale(&user),
                StatusCode::CONFLICT,
                "error.castReceiverTaken",
            ))
        }
        Announced::Full => {
            return Err(lerr(
                i18n::user_locale(&user),
                StatusCode::SERVICE_UNAVAILABLE,
                "error.castRosterFull",
            ))
        }
    };

    Ok(Json(AnnounceReply {
        commands,
        ttl_secs: crate::services::cast::RECEIVER_TTL.as_secs(),
    })
    .into_response())
}

/// `GET /api/cast/receivers` (Bearer) → `CastReceiver[]`. Only the receivers
/// signed into the caller's own account: casting is scoped to where you are
/// connected, so nobody browses, let alone drives, another household's TVs.
pub async fn list(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require_playback(&user)?;
    Ok(Json(state.cast.list(&user.id)).into_response())
}

/// `DELETE /api/cast/receivers/:id` (Bearer) → 204. Owner-scoped: naming somebody
/// else's receiver is a no-op, never an error, so this cannot probe or evict
/// another account's devices.
pub async fn unregister(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    require_playback(&user)?;
    if state.cast.remove_owned(&id, &user.id) {
        state
            .events
            .publish_to(&user.id, ServerEvent::CastReceiverGone { receiver_id: id });
    }
    Ok(StatusCode::NO_CONTENT.into_response())
}
