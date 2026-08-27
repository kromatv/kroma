//! `POST /downloads/torrent` what a `.torrent` an operator picked says about
//! itself.
//!
//! It does NOT queue anything.

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router};

use kroma_module_sdk::host::{blocking, json_error, AuthUser, HostStorage};

use super::{dm, require_downloads};
use crate::downloads::matching;
use crate::{torrent_file, InspectedTorrent};

// A `.torrent` for a season pack of a long-running show is a few hundred kB of
// piece hashes; a megabyte is generous and bounds the body before it is parsed.
const MAX_TORRENT_BYTES: usize = 1024 * 1024;

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route(
        "/downloads/torrent",
        post(inspect::<S>).layer(DefaultBodyLimit::max(MAX_TORRENT_BYTES)),
    )
}

pub async fn inspect<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    body: Bytes,
) -> Result<Response, Response> {
    require_downloads(&state, &user)?;
    let parsed = torrent_file::parse(&body)
        .map_err(|e| json_error(StatusCode::UNPROCESSABLE_ENTITY, &format!("{e:#}")))?;

    let store = dm(&state);
    let hash = parsed.info_hash.clone();
    blocking(move || store.keep_uploaded_torrent(&hash, &body))
        .await
        .map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "could not keep the file"))?;

    let shape = matching::shape_of(&parsed.name);
    Ok(Json(InspectedTorrent {
        magnet: parsed.magnet,
        info_hash: parsed.info_hash,
        release_title: parsed.name,
        size_bytes: parsed.size_bytes,
        kind: shape.kind,
        title: (!shape.title.trim().is_empty()).then_some(shape.title),
        year: shape.year,
        season: shape.season,
        episodes: shape.episodes,
    })
    .into_response())
}
