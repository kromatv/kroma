//! The catalogue's HLS routes: an item's media playlist for one (mode, anchor,
//! audio) session and the child init/segment files ffmpeg writes for it.

use std::net::SocketAddr;

use axum::extract::{ConnectInfo, Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Redirect, Response};

use kroma_media::hls::StreamMode;
use kroma_media::program::{self, Program, Session};
use kroma_media::Credential;

use crate::api::error::json_error;
use crate::api::media_ticket::MediaViewer;
use crate::api::visibility;
use crate::state::SharedState;

use super::hls_query::HlsQuery;
use super::{byte_sink, load_item};

/// `GET /api/items/:id/hls/:mode/:anchor/:audio/index.m3u8` (mode = an audio
/// treatment `copy`|`aac`|`aac-standard`|`aac-night`, optionally prefixed `h264-`
/// to re-encode the picture; anchor = start seconds for input `-ss`; audio =
/// audio-relative track index) → one media playlist muxing video with that single
/// audio track. Each (mode, anchor, audio) is its own session with its own child
/// URLs, so switching language means reloading with a different `audio`.
pub async fn hls_master(
    State(state): State<SharedState>,
    MediaViewer(viewer): MediaViewer,
    Path((id, mode, anchor, audio)): Path<(String, String, u64, u32)>,
    q: HlsQuery,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Response {
    let Some(mode) = StreamMode::parse(&mode) else {
        return json_error(StatusCode::BAD_REQUEST, "bad mode");
    };
    let Some(item) = load_item(&state, &viewer, id).await else {
        return visibility::out_of_scope();
    };
    let program = Program {
        id: &item.id,
        video: item.video.as_ref(),
        audio_tracks: &item.audio_tracks,
        duration_ms: item.duration_ms,
    };
    // Redirected rather than served here: the effective mode owns the session and
    // its segment URLs, so master and segments never disagree.
    let credential = q.ticket.credential();
    let effective = program.effective_mode(mode, audio, &q.decoders);
    if effective != mode {
        return Redirect::temporary(&hls_master_path(
            &item.id,
            effective,
            anchor,
            audio,
            &credential,
        ))
        .into_response();
    }
    let Some(abs) = item.abs_path.clone() else {
        return json_error(StatusCode::NOT_FOUND, "no media file for item");
    };
    // Offline mount / moved file: fail in one stat instead of spawning ffmpeg and
    // polling ~20s for a playlist that will never appear.
    let abs_check = abs.clone();
    let exists = tokio::task::spawn_blocking(move || std::path::Path::new(&abs_check).exists())
        .await
        .unwrap_or(false);
    if !exists {
        return json_error(
            StatusCode::NOT_FOUND,
            "media file unavailable (mount offline?)",
        );
    }
    let session = Session {
        mode,
        anchor,
        audio,
    };
    let sink = byte_sink(&state, &headers, &addr);
    match program
        .master(&state.hls, &abs, session, &credential, sink)
        .await
    {
        Some(resp) => resp,
        None => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "HLS remux unavailable (is ffmpeg installed?)",
        ),
    }
}

/// `GET /api/items/:id/hls/:mode/:anchor/:audio/:file` → a child file (init or
/// media segment) of the `(mode, anchor, audio)` session. A not-yet-produced
/// segment is polled for until ffmpeg flushes it.
pub async fn hls_file(
    State(state): State<SharedState>,
    MediaViewer(viewer): MediaViewer,
    Path((id, mode, anchor, audio, file)): Path<(String, String, u64, u32, String)>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Response {
    let Some(mode) = StreamMode::parse(&mode) else {
        return json_error(StatusCode::BAD_REQUEST, "bad mode");
    };
    if let Err(resp) = visibility::gate_item(&state, &viewer, &id).await {
        return resp;
    }
    let session = Session {
        mode,
        anchor,
        audio,
    };
    program::file(
        &state.hls,
        &id,
        session,
        &file,
        byte_sink(&state, &headers, &addr),
    )
    .await
}

// Item ids are hex `short_hash`es (optionally joined by a colon), so they need no
// escaping to sit in a path segment. The ticket is carried across because a
// redirect drops the query and the player would arrive with no credential.
fn hls_master_path(
    id: &str,
    mode: StreamMode,
    anchor: u64,
    audio: u32,
    credential: &Credential,
) -> String {
    format!(
        "/api/items/{id}/hls/{}/{anchor}/{audio}/index.m3u8{}",
        mode.token(),
        credential.query()
    )
}

#[cfg(test)]
mod tests;
