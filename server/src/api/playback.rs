//! Playback heartbeat + progress endpoints: live sessions for the admin
//! dashboard, and per-user resume positions. All require a session.

use std::net::SocketAddr;

use axum::extract::{ConnectInfo, Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::util::{client_ip, query};
use crate::api::extract::AuthUser;
use crate::db;
use crate::infra::events::ServerEvent;
use crate::services::playback::{self, Ping};
use crate::services::settings;
use crate::state::SharedState;
use axum::routing::{get, post, put};
use axum::Router;

/// Playback progress / resume, watched markers, "Ma liste", up-next and the
/// live-session heartbeats that feed the admin dashboard.
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/shows/{id}/up-next", get(up_next))
        .route("/items/{id}/next", get(next_episode))
        .route("/items/{id}/following", get(following_episodes))
        .route("/progress", get(list_progress))
        .route("/continue", get(continue_watching))
        .route(
            "/progress/{id}",
            get(get_progress).put(save_progress).delete(delete_progress),
        )
        .route("/watched", get(list_watched))
        .route("/watched/{id}", put(mark_watched).delete(unmark_watched))
        .route("/my-list", get(list_my_list))
        .route("/my-list/{id}", put(add_to_list).delete(remove_from_list))
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

    let ip = client_ip(&headers, &addr);
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
                let _ = crate::infra::subtitles::extract_pending_locked(&data_dir, &abs, &subs, &|| false);
            });
        }
    }

    let is_new = state.playback.upsert(
        ping,
        Some(user.id.clone()),
        user.username.clone(),
        ip,
        network,
        item.as_ref(),
    );

    let uid = user.id.clone();
    let _ = query(&state.db, move |pool| {
        let _ = db::touch_last_seen(&pool, &uid);
        Ok(())
    })
    .await;

    let count = state.playback.list().len();
    state.events.publish(if is_new {
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

#[derive(Debug, Deserialize)]
pub struct ProgressBody {
    #[serde(rename = "positionMs")]
    pub position_ms: i64,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<i64>,
}

/// `PUT /api/progress/:id` (Bearer) `{ positionMs, durationMs }` → 204.
pub async fn save_progress(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(item_id): Path<String>,
    Json(body): Json<ProgressBody>,
) -> Response {
    let pos = body.position_ms.max(0);
    match query(&state.db, move |pool| db::upsert_progress(&pool, &user.id, &item_id, pos, body.duration_ms))
        .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(resp) => resp,
    }
}

/// `DELETE /api/progress/:id` (Bearer) → 204 (finished / removed from Continue).
pub async fn delete_progress(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(item_id): Path<String>,
) -> Response {
    match query(&state.db, move |pool| db::delete_progress(&pool, &user.id, &item_id)).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(resp) => resp,
    }
}

/// `GET /api/progress/:id` (Bearer) → `ProgressEntry | null` for one item, so the
/// player can resume without fetching the whole list.
pub async fn get_progress(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(item_id): Path<String>,
) -> Response {
    match query(&state.db, move |pool| db::get_progress(&pool, &user.id, &item_id)).await {
        Ok(entry) => Json(entry).into_response(),
        Err(resp) => resp,
    }
}

/// `GET /api/progress` (Bearer) → `ProgressEntry[]` (all saved positions).
pub async fn list_progress(State(state): State<SharedState>, AuthUser(user): AuthUser) -> Response {
    match query(&state.db, move |pool| db::list_progress(&pool, &user.id)).await {
        Ok(p) => Json(p).into_response(),
        Err(resp) => resp,
    }
}

/// `GET /api/continue` (Bearer) → `ContinueItem[]` (resumable, newest first).
pub async fn continue_watching(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Response {
    match query(&state.db, move |pool| db::continue_watching(&pool, &user.id)).await {
        Ok(items) => Json(items).into_response(),
        Err(resp) => resp,
    }
}

/// `GET /api/shows/:id/up-next` (Bearer) → `UpNext | null`. The episode to play to
/// continue this show (resume in-progress, else next unwatched, else first).
pub async fn up_next(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(show_id): Path<String>,
) -> Response {
    match query(&state.db, move |pool| db::up_next_episode(&pool, &user.id, &show_id)).await {
        Ok(Some((item, resume))) => Json(crate::model::UpNext { item, resume }).into_response(),
        Ok(None) => Json(Option::<crate::model::UpNext>::None).into_response(),
        Err(resp) => resp,
    }
}

/// `GET /api/items/:id/next` → `MediaItem | null`. The next episode in the show
/// (sequence-based; public, drives player autoplay).
pub async fn next_episode(State(state): State<SharedState>, Path(item_id): Path<String>) -> Response {
    match query(&state.db, move |pool| db::next_episode(&pool, &item_id)).await {
        Ok(item) => Json(item).into_response(),
        Err(resp) => resp,
    }
}

const UP_NEXT_EPISODES: usize = 20;

/// `GET /api/items/:id/following` → `[MediaItem]`. Up to `UP_NEXT_EPISODES`
/// episodes after `id` in its show (sequence order), for the player's "up next"
/// episode rail. Empty for a movie / the last episode.
pub async fn following_episodes(
    State(state): State<SharedState>,
    Path(item_id): Path<String>,
) -> Response {
    match query(&state.db, move |pool| db::following_episodes(&pool, &item_id, UP_NEXT_EPISODES))
        .await
    {
        Ok(items) => Json(items).into_response(),
        Err(resp) => resp,
    }
}

/// `PUT /api/watched/:id` (Bearer) → 204. Marks the item watched and clears its
/// resume position (drops it from "Continue watching").
pub async fn mark_watched(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(item_id): Path<String>,
) -> Response {
    match query(&state.db, move |pool| db::mark_watched(&pool, &user.id, &item_id)).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(resp) => resp,
    }
}

/// `DELETE /api/watched/:id` (Bearer) → 204. Clears the watched flag.
pub async fn unmark_watched(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(item_id): Path<String>,
) -> Response {
    match query(&state.db, move |pool| db::unmark_watched(&pool, &user.id, &item_id)).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(resp) => resp,
    }
}

/// `GET /api/watched` (Bearer) → `string[]` (item ids the user marked watched).
pub async fn list_watched(State(state): State<SharedState>, AuthUser(user): AuthUser) -> Response {
    match query(&state.db, move |pool| db::list_watched(&pool, &user.id)).await {
        Ok(ids) => Json(ids).into_response(),
        Err(resp) => resp,
    }
}

/// `PUT /api/my-list/:id` (Bearer) → 204. Adds a title to the user's list.
pub async fn add_to_list(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(item_id): Path<String>,
) -> Response {
    match query(&state.db, move |pool| db::add_to_list(&pool, &user.id, &item_id)).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(resp) => resp,
    }
}

/// `DELETE /api/my-list/:id` (Bearer) → 204. Removes a title from the user's list.
pub async fn remove_from_list(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(item_id): Path<String>,
) -> Response {
    match query(&state.db, move |pool| db::remove_from_list(&pool, &user.id, &item_id)).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(resp) => resp,
    }
}

/// `GET /api/my-list` (Bearer) → `string[]` (item ids in the user's list).
pub async fn list_my_list(State(state): State<SharedState>, AuthUser(user): AuthUser) -> Response {
    match query(&state.db, move |pool| db::list_my_list(&pool, &user.id)).await {
        Ok(ids) => Json(ids).into_response(),
        Err(resp) => resp,
    }
}
