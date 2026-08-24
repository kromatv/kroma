//! The from-zero HLS remux: the media playlist for one (mode, anchor, audio)
//! session and the child init/segment files ffmpeg writes for it.

use std::net::SocketAddr;

use axum::body::Body;
use axum::extract::{ConnectInfo, Path, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Redirect, Response};
use serde::Deserialize;

use crate::api::error::json_error;
use crate::infra::hls::StreamMode;
use crate::state::SharedState;

use super::{byte_sink, load_item};

/// `?copy=` names the audio codecs the client can decode or pass through, so the
/// server can refuse to stream-copy one the device would play silent; `?video=`
/// does the same for the picture, which would otherwise play black. Absent means
/// no declared capability (the requested mode is trusted); present but empty means
/// the client decodes none, so any copied stream is transcoded.
#[derive(Debug, Deserialize)]
pub struct HlsQuery {
    pub copy: Option<String>,
    pub video: Option<String>,
}

/// `GET /api/items/:id/hls/:mode/:anchor/:audio/index.m3u8` (mode = an audio
/// treatment `copy`|`aac`|`aac-standard`|`aac-night`, optionally prefixed `h264-`
/// to re-encode the picture; anchor = start seconds for input `-ss`; audio =
/// audio-relative track index) → one media playlist muxing video with that single
/// audio track. Each (mode, anchor, audio) is its own session with its own child
/// URLs, so switching language means reloading with a different `audio`.
pub async fn hls_master(
    State(state): State<SharedState>,
    Path((id, mode, anchor, audio)): Path<(String, String, u64, u32)>,
    Query(q): Query<HlsQuery>,
) -> Response {
    let Some(mode) = StreamMode::parse(&mode) else {
        return json_error(StatusCode::BAD_REQUEST, "bad mode");
    };
    let Some(item) = load_item(&state, id).await else {
        return json_error(StatusCode::NOT_FOUND, "item not found");
    };
    // Redirected rather than served here: the effective mode owns the session and
    // its segment URLs, so master and segments never disagree. Both axes are
    // resolved before the comparison, so one redirect settles them together.
    let selected_codec = item
        .audio_tracks
        .iter()
        .find(|t| t.index == audio)
        .map(|t| t.codec.as_str());
    let effective = mode
        .for_client_audio(selected_codec, q.copy.as_deref())
        .for_client_video(
            item.video.as_ref().map(|v| v.codec.as_str()),
            q.video.as_deref(),
        );
    if effective != mode {
        return Redirect::temporary(&hls_master_path(&item.id, effective, anchor, audio))
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
    match state.hls.master(&item.id, &abs, audio, mode, anchor).await {
        // `X-Hls-Start` is the real start (the keyframe at-or-before the anchor, where
        // `-noaccurate_seek` begins); the client needs it to align clock and subtitles.
        Some((body, start)) => {
            let mut resp = playlist_response(body);
            if let Ok(v) = header::HeaderValue::from_str(&format!("{start:.3}")) {
                resp.headers_mut().insert("X-Hls-Start", v);
            }
            // `X-Media-Duration` is the true total length in seconds: without it a
            // client missing `durationMs` would size its slider to the growing EVENT
            // playlist's live edge.
            let dur_ms = match item.duration_ms {
                Some(d) => Some(d),
                None => state.hls.input_duration_ms(&abs).await,
            };
            if let Some(secs) = dur_ms.map(|ms| ms as f64 / 1000.0).filter(|s| *s > 0.0) {
                if let Ok(v) = header::HeaderValue::from_str(&format!("{secs:.3}")) {
                    resp.headers_mut().insert("X-Media-Duration", v);
                }
            }
            resp
        }
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
    Path((id, mode, anchor, audio, file)): Path<(String, String, u64, u32, String)>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Response {
    let Some(mode) = StreamMode::parse(&mode) else {
        return json_error(StatusCode::BAD_REQUEST, "bad mode");
    };
    let immutable = !file.ends_with(".m3u8");
    match state.hls.file(&id, mode, anchor, audio, &file).await {
        Some((bytes, ct)) => {
            byte_sink(&state, &headers, &addr).add(bytes.len() as u64);
            Response::builder()
                .header(header::CONTENT_TYPE, ct)
                // Each anchor's URLs are unique, so segment bytes never change; event
                // playlists grow.
                .header(
                    header::CACHE_CONTROL,
                    if immutable {
                        "public, max-age=31536000, immutable"
                    } else {
                        "no-store"
                    },
                )
                .body(Body::from(bytes))
                .unwrap()
        }
        // A segment that has not been produced yet 404s the same way one that was
        // pruned does, so the miss must never be cached: the URL becomes valid.
        None => {
            let mut resp = json_error(
                StatusCode::NOT_FOUND,
                "segment not found (session expired?)",
            );
            resp.headers_mut().insert(
                header::CACHE_CONTROL,
                header::HeaderValue::from_static("no-store"),
            );
            resp
        }
    }
}

// Item ids are hex `short_hash`es (optionally joined by a colon), so they need no
// escaping to sit in a path segment.
fn hls_master_path(id: &str, mode: StreamMode, anchor: u64, audio: u32) -> String {
    format!(
        "/api/items/{id}/hls/{}/{anchor}/{audio}/index.m3u8",
        mode.token()
    )
}

fn playlist_response(body: String) -> Response {
    Response::builder()
        .header(header::CONTENT_TYPE, "application/vnd.apple.mpegurl")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(body))
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::hls::{AudioMode, VideoMode};

    fn mode(video: VideoMode, audio: AudioMode) -> StreamMode {
        StreamMode::new(video, audio)
    }

    #[test]
    fn redirect_path_swaps_only_the_mode_segment() {
        assert_eq!(
            hls_master_path("abc123", mode(VideoMode::Copy, AudioMode::Aac), 30, 1),
            "/api/items/abc123/hls/aac/30/1/index.m3u8"
        );
        assert_eq!(
            hls_master_path("tv:s1e2", mode(VideoMode::Copy, AudioMode::Aac), 0, 0),
            "/api/items/tv:s1e2/hls/aac/0/0/index.m3u8"
        );
        assert_eq!(
            hls_master_path("abc123", mode(VideoMode::H264, AudioMode::AacNight), 30, 1),
            "/api/items/abc123/hls/h264-aac-night/30/1/index.m3u8"
        );
    }

    #[test]
    fn parse_mode_variants() {
        assert_eq!(
            StreamMode::parse("copy"),
            Some(mode(VideoMode::Copy, AudioMode::Copy))
        );
        assert_eq!(
            StreamMode::parse("aac"),
            Some(mode(VideoMode::Copy, AudioMode::Aac))
        );
        assert_eq!(
            StreamMode::parse("aac-standard"),
            Some(mode(VideoMode::Copy, AudioMode::AacStandard))
        );
        assert_eq!(
            StreamMode::parse("aac-night"),
            Some(mode(VideoMode::Copy, AudioMode::AacNight))
        );
        assert_eq!(
            StreamMode::parse("h264-copy"),
            Some(mode(VideoMode::H264, AudioMode::Copy))
        );
        assert_eq!(
            StreamMode::parse("h264-aac-standard"),
            Some(mode(VideoMode::H264, AudioMode::AacStandard))
        );
        assert_eq!(StreamMode::parse("bogus"), None);
    }

    // A redirect drops the query, so re-resolving the mode it names must be a
    // no-op or the master would bounce forever.
    #[test]
    fn the_redirect_target_resolves_to_itself() {
        let asked = mode(VideoMode::Copy, AudioMode::Copy);
        let effective = asked
            .for_client_audio(Some("dts"), Some("aac"))
            .for_client_video(Some("hevc"), Some("h264"));
        assert_eq!(effective, mode(VideoMode::H264, AudioMode::Aac));
        assert_eq!(
            hls_master_path("abc123", effective, 30, 1),
            "/api/items/abc123/hls/h264-aac/30/1/index.m3u8"
        );
        assert_eq!(
            effective
                .for_client_audio(Some("dts"), None)
                .for_client_video(Some("hevc"), None),
            effective
        );
    }
}
