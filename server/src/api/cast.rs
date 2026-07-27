//! `/api/cast` drive playback on another device: a phone or a browser starts a
//! title on the TV and then works as its remote (Spotify-Connect shaped, not
//! Chromecast: the server is the rendezvous, so it works over the tunnel too).
//!
//! Two sides talk here. A **sender** lists `/cast/receivers` and posts to
//! `/cast/receivers/:id/command`. A **receiver** (the TV app) normally lives on
//! the event socket instead of these routes (see `api::ws`): it attaches there
//! and reports changes as they happen. `/cast/announce` is its FALLBACK - the
//! same register + report + ack + collect, for a device whose socket is down.
//!
//! Everything requires a session **and** `playback` - the capability that means
//! "may watch" - so an account that isn't allowed to stream can't drive a TV into
//! streaming for it. Ids and titles are resolved against the catalog server-side
//! (never trusted from the body), receiver ids are shape-checked, and display
//! names are length-capped before they reach anybody else's picker.

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
use crate::model::{CastCommand, CastCommandEnvelope, CastPlayback, CastState, Permission, User};
use crate::services::cast::{valid_receiver_id, Announce, Announced};
use crate::services::playback::classify_network;
use crate::services::settings;
use crate::state::SharedState;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/cast/announce", post(announce))
        .route("/cast/receivers", get(list))
        .route("/cast/receivers/{id}", delete(unregister))
        .route("/cast/receivers/{id}/command", post(command))
}

fn locale(user: &User) -> &'static str {
    user.language.as_deref().and_then(i18n::normalize).unwrap_or(i18n::DEFAULT_LOCALE)
}

/// Gate every cast route on `playback`. Casting *is* watching, just on another
/// screen, so it answers to the same capability rather than to a new one.
fn require_playback(user: &User) -> Result<(), Response> {
    if user.can(Permission::Playback) {
        Ok(())
    } else {
        Err(lerr(locale(user), StatusCode::FORBIDDEN, "error.permissionDenied"))
    }
}

fn bad_id(user: &User) -> Response {
    lerr(locale(user), StatusCode::BAD_REQUEST, "error.castBadReceiver")
}

#[derive(Debug, Deserialize)]
pub struct AnnounceBody {
    #[serde(rename = "receiverId")]
    pub receiver_id: String,
    /// What the device calls itself ("Salon"). Capped + control-stripped by the
    /// registry: it lands in other people's pickers.
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub platform: String,
    /// Highest command seq this receiver has applied. Everything up to it leaves
    /// the inbox; anything above is replayed in the response.
    #[serde(rename = "lastAppliedSeq", default)]
    pub last_applied_seq: u64,
    /// Absent while the TV sits on its home screen.
    #[serde(default)]
    pub playback: Option<CastPlayback>,
}

#[derive(Debug, Serialize)]
pub struct AnnounceReply {
    /// Commands still to apply, oldest first. Empty on almost every beat.
    pub commands: Vec<CastCommandEnvelope>,
    /// Seconds after which a silent receiver drops off the roster, so the client
    /// can pace its heartbeat off the server rather than a hardcoded guess.
    #[serde(rename = "ttlSecs")]
    pub ttl_secs: u64,
}

/// `POST /api/cast/announce` (Bearer) → `AnnounceReply`.
///
/// Register + heartbeat + ack + collect, in one call. The fallback path: a
/// receiver that cannot hold its event socket open still gets its commands here,
/// one beat late instead of never.
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

    let ip = client_ip(&headers, &addr);
    let network = classify_network(&ip, &settings::local_networks(&state.settings));

    // Resolve the announced item once per title, exactly like the playback ping:
    // senders must render a title the receiver cannot spoof.
    let item = match body.playback.as_ref() {
        Some(pb) if state.cast.wants_item(&body.receiver_id, &pb.item_id) => {
            let id = pb.item_id.clone();
            query(&state.db, move |pool| db::get_item(&pool, &id)).await.unwrap_or_default()
        }
        _ => None,
    };

    let position = body.playback.as_ref().map(|p| (p.position_ms.max(0), p.duration_ms, p.state));
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
            // The row itself rides the bus, so senders patch their picker in place
            // instead of every one of them refetching the roster over HTTP.
            if changed {
                if let Some(row) = state.cast.row(&body.receiver_id) {
                    state.events.publish(ServerEvent::CastReceiverChanged {
                        receiver: Box::new(row),
                    });
                }
            }
            // The scrub position rides its own tiny event.
            if let Some((position_ms, duration_ms, cast_state)) = position {
                if !changed && cast_state != CastState::Idle {
                    state.events.publish(ServerEvent::CastPosition {
                        receiver_id: body.receiver_id.clone(),
                        position_ms,
                        duration_ms,
                        state: cast_state,
                    });
                }
            }
            commands
        }
        // Someone else's device already answers to this id. Refusing (rather than
        // taking it over) is what stops an account from impersonating another's
        // TV to collect the commands meant for it.
        Announced::Taken => {
            return Err(lerr(locale(&user), StatusCode::CONFLICT, "error.castReceiverTaken"))
        }
        Announced::Full => {
            return Err(lerr(
                locale(&user),
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

/// `GET /api/cast/receivers` (Bearer) → `CastReceiver[]`.
///
/// Every live receiver on the server, not just the caller's own: a household TV
/// runs its own profile, and the phone that wants to drive it is signed in as
/// someone else. The rows carry a display name, the platform and what is on
/// screen - no address, no account id, nothing a viewer couldn't already read
/// from the catalog.
pub async fn list(State(state): State<SharedState>, AuthUser(user): AuthUser) -> Result<Response, Response> {
    require_playback(&user)?;
    Ok(Json(state.cast.list()).into_response())
}

/// `DELETE /api/cast/receivers/:id` (Bearer) → 204. A receiver leaving the
/// roster on its own (sign-out, app quit) so it doesn't linger for the TTL.
/// Owner-scoped: naming somebody else's receiver is a no-op, never an error, so
/// this can't be used to probe (or evict) another account's devices.
pub async fn unregister(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    require_playback(&user)?;
    if state.cast.remove_owned(&id, &user.id) {
        state.events.publish(ServerEvent::CastReceiverGone { receiver_id: id });
    }
    Ok(StatusCode::NO_CONTENT.into_response())
}

#[derive(Debug, Deserialize)]
pub struct CommandBody {
    #[serde(flatten)]
    pub command: CastCommand,
}

#[derive(Debug, Serialize)]
pub struct CommandReply {
    /// The command's sequence number. A sender can watch for it to be applied.
    pub seq: u64,
}

/// `POST /api/cast/receivers/:id/command` (Bearer) `{ type, ... }` → `{ seq }`.
///
/// Queues one order and pushes it to the receiver's account over the event bus.
/// A `play` names an item id, so it is checked against the catalog first: a 404
/// here is the same 404 the item itself would give, and the TV is never handed an
/// id the server didn't recognize.
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
    if let CastCommand::Play { item_id, .. } = &body.command {
        let wanted = item_id.clone();
        let known = query(&state.db, move |pool| db::get_item(&pool, &wanted))
            .await
            .unwrap_or_default()
            .is_some();
        if !known {
            return Err(lerr(locale(&user), StatusCode::NOT_FOUND, "error.itemNotFound"));
        }
    }

    let Some(owner) = state.cast.owner_of(&id) else {
        return Err(lerr(locale(&user), StatusCode::NOT_FOUND, "error.castReceiverGone"));
    };
    let Some(envelope) = state.cast.enqueue(&id, body.command) else {
        return Err(lerr(locale(&user), StatusCode::NOT_FOUND, "error.castReceiverGone"));
    };

    // Addressed to the account the receiver is signed into: the TV's own socket
    // gets it immediately, and no other household's clients ever see it. The
    // heartbeat reply is the fallback if that socket happens to be down.
    state.events.publish_to(
        &owner,
        ServerEvent::CastCommandIssued {
            receiver_id: id,
            seq: envelope.seq,
            command: envelope.command,
        },
    );
    Ok(Json(CommandReply { seq: envelope.seq }).into_response())
}
