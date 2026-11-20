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
use crate::api::permission::require;
use crate::api::util::{client_ip, query};
use crate::db;
use crate::i18n;
use crate::infra::events::ServerEvent;
use crate::model::{
    CastCommandEnvelope, CastPlayback, CastReceiver, CastState, CastWakeHint, Permission, User,
};
use crate::services::cast::wake::Arrival;
use crate::services::cast::{valid_receiver_id, Announce, Announced};
use crate::services::playback::classify_network;
use crate::services::settings;
use crate::state::SharedState;

mod command;
mod receiver;
mod wake;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/cast/announce", post(announce))
        .route("/cast/receivers", get(list))
        .route("/cast/receivers/{id}", delete(unregister))
        .route("/cast/receivers/{id}/command", post(command::command))
        .route(
            "/cast/receivers/{id}/wake",
            post(wake::wake).delete(wake::forget),
        )
}

pub(crate) struct Heard<'a> {
    pub user_id: &'a str,
    pub peer: &'a str,
    pub row: CastReceiver,
    pub hint: Option<CastWakeHint>,
}

/// Tell the account's clients a television arrived or changed, and keep what
/// it said about reaching itself. One that says nothing at all is an older
/// build, and what is kept for it stays.
pub(crate) fn arrived(state: &SharedState, heard: Heard) {
    let owner = heard.user_id.to_string();
    let row = heard.row.clone();
    keep(state, heard);
    state.events.publish_to(
        &owner,
        ServerEvent::CastReceiverChanged {
            receiver: Box::new(row),
        },
    );
}

fn keep(state: &SharedState, heard: Heard) {
    let Some(hint) = heard.hint else {
        return;
    };
    let arrival = Arrival {
        row: heard.row,
        user_id: heard.user_id.to_string(),
        hint,
        peer: heard.peer.to_string(),
    };
    let now_ms = crate::services::jobs::now_ms();
    tokio::spawn(crate::services::cast::wake::keep(
        state.db.clone(),
        arrival,
        now_ms,
    ));
}

/// Whose senders hear that an order was issued, and for which receiver.
#[derive(Clone, Copy)]
pub(crate) struct Issued<'a> {
    pub user_id: &'a str,
    pub receiver_id: &'a str,
}

pub(crate) fn publish_issued(state: &SharedState, to: Issued<'_>, envelope: CastCommandEnvelope) {
    state.events.publish_to(
        to.user_id,
        ServerEvent::CastCommandIssued {
            receiver_id: to.receiver_id.to_string(),
            seq: envelope.seq,
            command: envelope.command,
        },
    );
}

pub(crate) fn publish_all_issued(
    state: &SharedState,
    to: Issued<'_>,
    envelopes: Vec<CastCommandEnvelope>,
) {
    for envelope in envelopes {
        publish_issued(state, to, envelope);
    }
}

fn refuse(user: &User, status: StatusCode, key: &'static str) -> Response {
    lerr(i18n::user_locale(user), status, key)
}

fn bad_id(user: &User) -> Response {
    refuse(user, StatusCode::BAD_REQUEST, "error.castBadReceiver")
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
    #[serde(default)]
    pub wake: Option<CastWakeHint>,
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
    require(&user, Permission::Playback)?;
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

    let position = position_beat(&body);
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
                    let (user_id, peer, hint) = (&user.id, &ip, body.wake);
                    arrived(
                        &state,
                        Heard {
                            user_id,
                            peer,
                            row,
                            hint,
                        },
                    );
                }
            }
            if let Some(beat) = position.filter(|_| !changed) {
                state.events.publish_to(&user.id, beat);
            }
            commands
        }
        // Refusing a taken id, rather than seizing it, is what stops an account
        // impersonating another's TV to collect the commands meant for it.
        Announced::Taken => {
            return Err(refuse(
                &user,
                StatusCode::CONFLICT,
                "error.castReceiverTaken",
            ))
        }
        Announced::Full => {
            return Err(refuse(
                &user,
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

fn position_beat(body: &AnnounceBody) -> Option<ServerEvent> {
    let playback = body.playback.as_ref()?;
    (playback.state != CastState::Idle).then(|| ServerEvent::CastPosition {
        receiver_id: body.receiver_id.clone(),
        position_ms: playback.position_ms.max(0),
        duration_ms: playback.duration_ms,
        buffered_ms: playback.buffered_ms,
        state: playback.state,
    })
}

/// `GET /api/cast/receivers` (Bearer) → `CastReceiver[]`. Only the receivers
/// signed into the caller's own account: casting is scoped to where you are
/// connected, so nobody browses, let alone drives, another household's TVs.
/// A television that is off but can be brought back follows, marked `asleep`.
pub async fn list(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require(&user, Permission::Playback)?;
    let mut receivers = state.cast.list(&user.id);
    let owner = user.id.clone();
    let kept = query(&state.db, move |pool| {
        db::cast_devices_for_user(&pool, &owner)
    })
    .await
    .unwrap_or_default();
    let asleep: Vec<CastReceiver> = kept
        .iter()
        .filter(|device| receivers.iter().all(|live| live.id != device.receiver_id))
        .filter(|device| !crate::services::cast::wake::plan(device).is_empty())
        .map(|device| crate::services::cast::wake::asleep_row(device, &user.username))
        .collect();
    receivers.extend(asleep);
    Ok(Json(receivers).into_response())
}

/// `DELETE /api/cast/receivers/:id` (Bearer) → 204. Owner-scoped: naming somebody
/// else's receiver is a no-op, never an error, so this cannot probe or evict
/// another account's devices.
pub async fn unregister(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    require(&user, Permission::Playback)?;
    if state.cast.remove_owned(&id, &user.id) {
        state
            .events
            .publish_to(&user.id, ServerEvent::CastReceiverGone { receiver_id: id });
    }
    Ok(StatusCode::NO_CONTENT.into_response())
}
