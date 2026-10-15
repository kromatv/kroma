//! The live-session heartbeats that feed the admin dashboard: a player beats
//! with what it plays, a catalogue item or a file of a watch download, and says
//! when it stops.

use std::net::SocketAddr;

use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::api::util::{client_ip, query};
use crate::api::visibility;
use crate::db;
use crate::i18n;
use crate::infra::events::ServerEvent;
use crate::model::{MediaItem, Permission, User, WatchItem};
use crate::services::playback::{self, Beat, Ping, Playing};
use crate::services::settings;
use crate::state::SharedState;

/// A heartbeat is a few hundred bytes; this bounds one before it is parsed,
/// with room for the longest title and poster address a watch item may carry.
pub const MAX_BEAT_BYTES: usize = 16 * 1024;

#[derive(Debug, Deserialize)]
pub struct PingBody {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "itemId", default)]
    pub item_id: Option<String>,
    #[serde(default)]
    pub watch: Option<WatchItem>,
    #[serde(rename = "positionMs")]
    pub position_ms: i64,
    #[serde(rename = "durationMs", default)]
    pub duration_ms: Option<i64>,
    #[serde(default = "default_state")]
    pub state: String,
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(default)]
    pub player: Option<String>,
    #[serde(default)]
    pub device: Option<String>,
    #[serde(default)]
    pub audio: Option<String>,
    #[serde(default)]
    pub subtitle: Option<String>,
}

fn default_state() -> String {
    "playing".into()
}
fn default_mode() -> String {
    "direct".into()
}

async fn gate(state: &SharedState, user: &User, playing: &Playing) -> Result<(), Response> {
    match playing {
        Playing::Item(id) => visibility::gate_item(state, user, id).await,
        Playing::Watch(_) if user.can(Permission::WatchablePlay) => Ok(()),
        Playing::Watch(_) => Err(lerr(
            i18n::user_locale(user),
            StatusCode::FORBIDDEN,
            "error.permissionDenied",
        )),
    }
}

async fn first_sight(
    state: &SharedState,
    session_id: &str,
    playing: &Playing,
) -> Option<MediaItem> {
    let id = playing.item_id()?.to_owned();
    if state.playback.contains(session_id) {
        return None;
    }
    (query(&state.db, move |pool| db::get_item(&pool, &id)).await).unwrap_or_default()
}

/// `POST /api/playback/ping` (Bearer) → 204. Upserts the caller's live session.
/// The body names exactly one of `itemId` or `watch`, anything else is a 400. A
/// catalogue item needs the caller's library grant and a watch download needs
/// `watchable.play`, the right the capability listing is offered under.
pub async fn ping(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<PingBody>,
) -> Response {
    // An admin just terminated this session: refuse rather than recreate it. The
    // client treats 410 as "stop now".
    if state.playback.is_recently_terminated(&body.session_id) {
        return StatusCode::GONE.into_response();
    }
    let Some(playing) = Playing::named(body.item_id, body.watch) else {
        return lerr(
            i18n::user_locale(&user),
            StatusCode::BAD_REQUEST,
            "error.playbackBadTitle",
        );
    };
    if let Err(resp) = gate(&state, &user, &playing).await {
        return resp;
    }

    let ip = client_ip(&headers, &addr, &state.config.trusted_proxies);
    let network = playback::classify_network(&ip, &settings::local_networks(&state.settings));
    let item = first_sight(&state, &body.session_id, &playing).await;

    // First beat of a session: pre-warm the text-subtitle cache so a mid-film
    // toggle is a disk read, not a whole-file demux. `extract_pending_locked`
    // dedupes against the pipeline stage and the on-demand endpoint.
    if let Some(item) = item.as_ref() {
        if let Some(abs) = item.abs_path.clone() {
            let subs = item.subtitles.clone();
            let data_dir = state.config.data_dir.clone();
            tokio::task::spawn_blocking(move || {
                let _ = crate::infra::subtitles::extract_pending_locked(
                    &data_dir,
                    &abs,
                    &subs,
                    &|| false,
                );
            });
        }
    }

    let ping = Ping {
        session_id: body.session_id,
        playing,
        position_ms: body.position_ms.max(0),
        duration_ms: body.duration_ms,
        state: body.state,
        mode: body.mode,
        player: body.player.unwrap_or_else(|| "KROMA".into()),
        device: body.device.unwrap_or_else(|| "Appareil".into()),
        audio: body.audio,
        subtitle: body.subtitle,
    };
    let beat = state.playback.upsert(
        ping,
        Some(user.id.clone()),
        user.username.clone(),
        ip,
        network,
        item.as_ref(),
    );
    // A session another account owns answers 204, as `/playback/stop` does: the
    // endpoint must not double as a way to discover which sessions exist.
    if beat == Beat::Refused {
        return StatusCode::NO_CONTENT.into_response();
    }

    let uid = user.id.clone();
    let _ = query(&state.db, move |pool| {
        let _ = db::touch_last_seen(&pool, &uid);
        Ok(())
    })
    .await;

    let count = state.playback.list().len();
    state.events.publish(if beat == Beat::Opened {
        ServerEvent::PlaybackStarted { count }
    } else {
        ServerEvent::PlaybackUpdated { count }
    });
    StatusCode::NO_CONTENT.into_response()
}

#[derive(Debug, Deserialize)]
pub struct StopBody {
    #[serde(rename = "sessionId")]
    pub session_id: String,
}

/// `POST /api/playback/stop` (Bearer) → 204. Ends a session and logs it to
/// history immediately (rather than waiting for the reaper).
pub async fn stop(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<StopBody>,
) -> Response {
    // Owner-scoped: naming somebody else's session is a no-op rather than an
    // error, so this cannot be used to probe for session ids.
    if let Some(session) = state.playback.remove_owned(&body.session_id, &user.id) {
        let _ = query(&state.db, move |pool| {
            playback::record(&pool, &session);
            Ok(())
        })
        .await;
    }
    let count = state.playback.list().len();
    state.events.publish(ServerEvent::PlaybackStopped { count });
    StatusCode::NO_CONTENT.into_response()
}
