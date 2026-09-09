//! Playback endpoints: the live-session heartbeats that feed the admin
//! dashboard. All require a session, and every one that names an item refuses an
//! item the caller's library grant does not cover (ACCT-21).

use std::net::SocketAddr;

use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::extract::AuthUser;
use crate::api::util::{client_ip, query};
use crate::api::visibility;
use crate::db;
use crate::infra::events::ServerEvent;
use crate::services::playback::{self, Beat, Ping};
use crate::services::settings;
use crate::state::SharedState;
use axum::routing::{get, post, put};
use axum::Router;

mod progress;
mod up_next;
mod watch_state;

/// Playback progress / resume, watched markers, "Ma liste", up-next and the
/// live-session heartbeats that feed the admin dashboard.
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/shows/{id}/up-next", get(up_next::up_next))
        .route("/items/{id}/next", get(up_next::next_episode))
        .route("/items/{id}/following", get(up_next::following_episodes))
        .route("/progress", get(progress::list_progress))
        .route("/continue", get(progress::continue_watching))
        .route(
            "/progress/{id}",
            get(progress::get_progress)
                .put(progress::save_progress)
                .delete(progress::delete_progress),
        )
        .route("/watched", get(watch_state::list_watched))
        .route(
            "/watched/{id}",
            put(watch_state::mark_watched).delete(watch_state::unmark_watched),
        )
        .route("/my-list", get(watch_state::list_my_list))
        .route(
            "/my-list/{id}",
            put(watch_state::add_to_list).delete(watch_state::remove_from_list),
        )
        .route("/playback/ping", post(ping))
        .route("/playback/stop", post(stop))
}

#[derive(Debug, Deserialize)]
pub struct PingBody {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "itemId")]
    pub item_id: String,
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

/// `POST /api/playback/ping` (Bearer) → 204. Upserts the caller's live session.
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
    if let Err(resp) = visibility::gate_item(&state, &user, &body.item_id).await {
        return resp;
    }

    let ip = client_ip(&headers, &addr, &state.config.trusted_proxies);
    let network = playback::classify_network(&ip, &settings::local_networks(&state.settings));

    let item = if state.playback.contains(&body.session_id) {
        None
    } else {
        let id = body.item_id.clone();
        (query(&state.db, move |pool| db::get_item(&pool, &id)).await).unwrap_or_default()
    };

    let ping = Ping {
        session_id: body.session_id,
        item_id: body.item_id,
        position_ms: body.position_ms.max(0),
        duration_ms: body.duration_ms,
        state: body.state,
        mode: body.mode,
        player: body.player.unwrap_or_else(|| "KROMA".into()),
        device: body.device.unwrap_or_else(|| "Appareil".into()),
        audio: body.audio,
        subtitle: body.subtitle,
    };

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
