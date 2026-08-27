//! `GET /downloads/{id}/contents` what a queued torrent actually holds.

use axum::extract::{Path as AxPath, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};

use kroma_module_sdk::host::{blocking, json_error, AuthUser, HostStorage};

use super::{dm, require_downloads};
use crate::db;
use crate::{TorrentContentsView, TorrentFileView};

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/downloads/{id}/contents", get(contents::<S>))
        // Before the `{id}` route, which would otherwise read `episodes` as one.
        .route("/downloads/episodes", get(episodes::<S>))
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpisodesParams {
    tmdb_id: u64,
    season: u32,
}

/// `GET /downloads/episodes?tmdbId=&season=` what the provider calls each
/// episode of one season, so a file list reads as episodes rather than as
/// filenames. Best-effort: an empty list is "nothing to add".
pub async fn episodes<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    axum::extract::Query(params): axum::extract::Query<EpisodesParams>,
) -> Result<Response, Response> {
    require_downloads(&state, &user)?;
    Ok(Json(state.metadata_episodes(params.tmdb_id, params.season)).into_response())
}

pub async fn contents<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
) -> Result<Response, Response> {
    require_downloads(&state, &user)?;
    let ledger = state.db().clone();
    let lookup = id.clone();
    let row = blocking(move || {
        let conn = ledger.get()?;
        Ok(db::get_download(&conn, &lookup)?)
    })
    .await?
    .ok_or_else(|| state.lerr(&user, StatusCode::NOT_FOUND, "error.downloadNotFound"))?;

    let manager = dm(&state);
    let host = state.clone();
    // Reading a file list is a metadata fetch, which for a magnet with no cached
    // `.torrent` means talking to the swarm.
    let entries = blocking(move || manager.list_files(&host, &row.magnet_or_url))
        .await
        .map_err(|_| json_error(StatusCode::BAD_GATEWAY, "could not read the torrent"))?;

    let sized: Vec<(String, u64)> = entries
        .iter()
        .map(|e| (e.path.clone(), e.size_bytes))
        .collect();
    let content = kroma_scene::classify(&sized);
    let files = entries
        .iter()
        .zip(content.files.iter())
        .map(|(entry, read)| TorrentFileView {
            index: entry.index,
            path: entry.path.clone(),
            size_bytes: entry.size_bytes,
            is_video: read.is_video,
            season: read.season,
            episode: read.episode,
        })
        .collect();
    Ok(Json(TorrentContentsView {
        kind: serde_json::to_value(content.kind)
            .ok()
            .and_then(|v| v.as_str().map(str::to_string))
            .unwrap_or_else(|| "unknown".into()),
        seasons: content.seasons,
        files,
    })
    .into_response())
}
