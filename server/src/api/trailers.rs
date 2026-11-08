//! `/api/trailers/{movie|tv}/{tmdbId}`: a title's trailers ranked for the
//! viewer's language, whether or not the library holds the title, and the
//! finished MP4 of one of them for the player. The fetch itself is the work of
//! whichever module answers the `trailer` point; with none, the list still
//! answers and says nothing is playable.

use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;

use kroma_media::stream::stream_file;
use kroma_module_host::pinned_resolver;

use crate::api::error::{json_error, lerr};
use crate::api::extract::AuthUser;
use crate::api::media_ticket::MediaViewer;
use crate::api::util::blocking;
use crate::i18n::{self, AskedLocale};
use crate::infra::metadata::{title_videos, Target};
use crate::infra::metrics::ByteSink;
use crate::model::{rank_trailers, Trailer, User};
use crate::services::settings;
use crate::services::trailers::{spoken_language, Preparation, Trailers, POINT};
use crate::state::SharedState;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/trailers/{kind}/{tmdb_id}", get(list))
        .route("/trailers/{kind}/{tmdb_id}/{video}/prepare", post(prepare))
}

pub fn public_routes() -> Router<SharedState> {
    Router::new().route("/trailers/{kind}/{tmdb_id}/{video}/stream", get(stream))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrailerList {
    pub playable: bool,
    pub trailers: Vec<Trailer>,
}

fn target_of(kind: &str) -> Result<Target, Response> {
    match kind {
        "movie" => Ok(Target::Movie),
        "tv" | "show" => Ok(Target::Tv),
        _ => Err(json_error(StatusCode::NOT_FOUND, "unknown media type")),
    }
}

fn viewer_language(state: &SharedState, user: &User, reader: Option<&str>) -> String {
    [
        user.audio_language.as_deref(),
        reader,
        user.language.as_deref(),
    ]
    .into_iter()
    .flatten()
    .find_map(spoken_language)
    .or_else(|| spoken_language(&settings::metadata_language(&state.settings, &state.config)))
    .unwrap_or_else(|| "en".to_string())
}

fn ranked(state: &SharedState, target: Target, tmdb_id: u64, viewer: &str) -> Vec<Trailer> {
    let Some(key) = state.config.tmdb_api_key.as_deref() else {
        return Vec::new();
    };
    title_videos(key, target, tmdb_id, viewer)
        .map(|found| rank_trailers(&found.videos, viewer, found.original_language.as_deref()))
        .unwrap_or_default()
}

fn title_key(target: Target, tmdb_id: u64) -> String {
    match target {
        Target::Movie => format!("movie:{tmdb_id}"),
        Target::Tv => format!("tv:{tmdb_id}"),
    }
}

fn cache(state: &SharedState) -> Option<Arc<Trailers>> {
    kroma_module_host::service::<Trailers>(state)
}

/// `GET /api/trailers/{movie|tv}/:tmdbId` the title's trailers, best first for
/// the viewer, and whether this server can play them.
pub async fn list(
    State(state): State<SharedState>,
    AskedLocale(reader): AskedLocale,
    AuthUser(user): AuthUser,
    Path((kind, tmdb_id)): Path<(String, u64)>,
) -> Result<Json<TrailerList>, Response> {
    let target = target_of(&kind)?;
    let viewer = viewer_language(&state, &user, reader);
    let playable =
        cache(&state).is_some() && pinned_resolver(state.as_ref(), POINT, None).is_some();
    let trailers = blocking({
        let state = state.clone();
        move || Ok(ranked(&state, target, tmdb_id, &viewer))
    })
    .await?;
    if let Some(cache) = cache(&state) {
        cache.offer(
            &title_key(target, tmdb_id),
            trailers.iter().map(|t| t.video.clone()),
        );
    }
    Ok(Json(TrailerList { playable, trailers }))
}

/// `POST /api/trailers/{movie|tv}/:tmdbId/:video/prepare` starts fetching one
/// of the title's trailers, or says how far along it is. Polled until `ready`.
pub async fn prepare(
    State(state): State<SharedState>,
    AskedLocale(reader): AskedLocale,
    AuthUser(user): AuthUser,
    Path((kind, tmdb_id, video)): Path<(String, u64, String)>,
) -> Result<Json<Preparation>, Response> {
    let target = target_of(&kind)?;
    let locale = i18n::user_locale(&user);
    let resolve = crate::api::point::require(&state, &user, POINT)?;
    let cache =
        cache(&state).ok_or_else(|| lerr(locale, StatusCode::NOT_FOUND, "error.moduleDisabled"))?;
    let viewer = viewer_language(&state, &user, reader);
    let listed = cache.offered(&title_key(target, tmdb_id), &video)
        || blocking({
            let state = state.clone();
            let video = video.clone();
            move || {
                Ok(ranked(&state, target, tmdb_id, &viewer)
                    .iter()
                    .any(|t| t.video == video))
            }
        })
        .await?;
    if !listed {
        return Err(lerr(locale, StatusCode::NOT_FOUND, "error.itemNotFound"));
    }
    Ok(Json(cache.prepare(&video, resolve)))
}

/// `GET /api/trailers/{movie|tv}/:tmdbId/:video/stream` the prepared trailer,
/// with `Range`, for a player that carries the media ticket in its URL.
pub async fn stream(
    State(state): State<SharedState>,
    MediaViewer(_viewer): MediaViewer,
    headers: HeaderMap,
    Path((kind, _tmdb_id, video)): Path<(String, u64, String)>,
) -> Response {
    if let Err(refused) = target_of(&kind) {
        return refused;
    }
    match cache(&state).and_then(|cache| cache.file(&video)) {
        Some(path) => stream_file(&path, &headers, ByteSink::none()).await,
        None => json_error(StatusCode::NOT_FOUND, "this trailer has not been prepared"),
    }
}
