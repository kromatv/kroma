//! Media byte delivery: range-streamed original files, the from-zero HLS remux,
//! and on-demand WebVTT subtitle extraction. Bodies are media bytes / playlists.

use std::net::SocketAddr;

use axum::body::Body;
use axum::extract::{ConnectInfo, Path, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::Response;
use serde::Deserialize;

use crate::api::error::json_error;
use crate::api::util::{client_ip, query};
use crate::db;
use crate::infra::hls::StreamMode;
use crate::infra::stream::stream_or_demo_error;
use crate::infra::subtitles;
use crate::model::MediaItem;
use crate::services::playback;
use crate::services::settings;
use crate::state::SharedState;
use axum::routing::get;
use axum::Router;
use tokio::io::AsyncReadExt;

fn byte_sink(state: &SharedState, headers: &HeaderMap, addr: &SocketAddr) -> crate::infra::metrics::ByteSink {
    let ip = client_ip(headers, addr, &state.config.trusted_proxies);
    let is_lan = playback::is_lan(&ip, &settings::local_networks(&state.settings));
    state.metrics.sink(is_lan)
}

/// Direct-play streaming, HLS remux, storyboard previews and subtitle tracks.
/// Unauthenticated: a `<video>` / hls.js element can't attach a bearer to the
/// URLs it fetches, so these stay open under the LAN trust model.
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/items/{id}/stream", get(stream_item))
        .route("/items/{id}/hls/{mode}/{anchor}/{audio}/index.m3u8", get(hls_master))
        .route("/items/{id}/hls/{mode}/{anchor}/{audio}/{file}", get(hls_file))
        .route("/items/{id}/storyboard", get(storyboard))
        .route("/items/{id}/storyboard.img", get(storyboard_image))
        .route("/items/{id}/subtitles/{track}", get(subtitles))
}

/// Session-gated media routes: the download is a plain fetch, so it can carry a
/// bearer - and must, because each call holds an ffmpeg for a whole film.
pub fn protected_routes() -> Router<SharedState> {
    Router::new().route("/items/{id}/download", get(download_item))
}

// Copy-safe means fMP4-muxable (mirrors the clients' `FMP4_COPY_CODECS`) AND, when
// the client declared a `copy` set, present in it - Android phones usually lack
// Dolby decoders and send `aac`, iOS sends `aac,ac3,eac3`.
fn download_copies_audio(codec: Option<&str>, client_set: Option<&str>) -> bool {
    let Some(codec) = codec else { return false };
    if !matches!(codec, "aac" | "ac3" | "eac3") {
        return false;
    }
    match client_set {
        None => true,
        Some(set) => set.split(',').any(|c| c.trim().eq_ignore_ascii_case(codec)),
    }
}

// Every track rides along in stream order: AVFoundation synthesizes local audio
// selection from the MP4 muxer's single alternate group, so offline pickers select
// by ordinal.
fn download_audio_args(
    tracks: &[crate::model::AudioStream],
    fallback_codec: Option<&str>,
    client_set: Option<&str>,
) -> Vec<String> {
    if tracks.is_empty() {
        // Unprobed item: the map stays optional so a video-only file still downloads.
        let mut args: Vec<String> = vec!["-map".into(), "0:a:0?".into()];
        args.extend(audio_codec_args(":a", download_copies_audio(fallback_codec, client_set)));
        return args;
    }
    let mut sorted: Vec<&crate::model::AudioStream> = tracks.iter().collect();
    sorted.sort_by_key(|t| t.index);
    let mut args: Vec<String> = Vec::new();
    for (out, t) in sorted.iter().enumerate() {
        // NOT optional (`0:a:N?`): the per-track codec options are numbered by OUTPUT
        // position, so a map matching nothing shifts every later stream and lands
        // `copy` on a track meant to be transcoded. Fail loudly instead.
        args.extend(["-map".into(), format!("0:a:{}", t.index)]);
        args.extend(audio_codec_args(&format!(":a:{out}"), download_copies_audio(Some(t.codec.as_str()), client_set)));
    }
    args
}

fn audio_codec_args(spec: &str, copy: bool) -> Vec<String> {
    if copy {
        return vec![format!("-c{spec}"), "copy".into()];
    }
    vec![
        format!("-c{spec}"),
        "aac".into(),
        format!("-ac{spec}"),
        "2".into(),
        format!("-b{spec}"),
        "192k".into(),
    ]
}

/// `?copy=` and `?video=` name codecs the client decodes natively. Absent means
/// the default (`copy` → `aac,ac3,eac3`; `video` → stream-copy the source);
/// present but empty (`?copy=`) means none, so transcode every track.
#[derive(Debug, Deserialize)]
pub struct DownloadQuery {
    pub copy: Option<String>,
    pub video: Option<String>,
}

/// `GET /api/items/:id/download` (optional `?copy=aac,ac3`, `?video=hevc,h264`)
/// → the whole title as one fragmented MP4, remuxed to a container/codec combo
/// phones play locally and streamed chunked, so no `Content-Length`. Admission is
/// capped by `state.downloads`; a full gate answers `503`.
pub async fn download_item(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    Query(q): Query<DownloadQuery>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<Response, Response> {
    let permit = state.downloads.clone().try_acquire_owned().map_err(|_| {
        json_error(StatusCode::SERVICE_UNAVAILABLE, "too many downloads in progress, try again later")
    })?;
    let item = query(&state.db, move |pool| db::get_item(&pool, &id))
        .await?
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "item not found"))?;
    let abs = item
        .abs_path
        .clone()
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "no file for item"))?;
    if !std::path::Path::new(&abs).exists() {
        return Err(json_error(StatusCode::NOT_FOUND, "media file unavailable (mount offline?)"));
    }

    let source_video = item.video.as_ref().map(|v| v.codec.as_str());
    let video_copy = match (q.video.as_deref(), source_video) {
        (None, _) => true,
        (Some(set), Some(codec)) => set.split(',').any(|c| c.trim().eq_ignore_ascii_case(codec)),
        (Some(_), None) => false,
    };
    let mut cmd = tokio::process::Command::new("ffmpeg");
    cmd.args(["-v", "error", "-nostdin", "-i"]).arg(&abs).args(["-map", "0:v:0"]);
    if video_copy {
        cmd.args(["-c:v", "copy"]);
        if source_video == Some("hevc") {
            // Apple decoders require the `hvc1` sample-entry tag; stream-copied
            // HEVC defaults to `hev1`, which plays AUDIO ONLY on iOS local files.
            cmd.args(["-tag:v", "hvc1"]);
        }
    } else {
        // H.264 8-bit because every download target decodes it; offline has no
        // fallback. HDR sources are not tone-mapped (no zimg) and read washed-out.
        cmd.args(["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p"]);
    }
    cmd.args(download_audio_args(
        &item.audio_tracks,
        item.audio.as_ref().map(|a| a.codec.as_str()),
        q.copy.as_deref(),
    ));
    // NO `empty_moov`: the muxer cannot write an upfront moov for EAC3 (codec params
    // are only known after parsing packets); `frag_keyframe` emits it with the first
    // fragment instead, which a pipe handles fine.
    cmd.args([
        "-dn",
        "-map_chapters",
        "-1",
        "-movflags",
        "frag_keyframe+default_base_moof",
        "-f",
        "mp4",
        "pipe:1",
    ]);
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, &format!("ffmpeg spawn failed: {e}")))?;
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| json_error(StatusCode::INTERNAL_SERVER_ERROR, "ffmpeg stdout unavailable"))?;
    let mut stderr = child.stderr.take();

    // Wait for the first bytes before committing to a `200`: every structural
    // failure is decided in the muxer's init, and past the status line a
    // truncated body would be stored as a finished download. One read only —
    // `ftyp` lands the moment init succeeds, the first fragment can be minutes away.
    let mut head = vec![0u8; 64 * 1024];
    let filled = stdout.read(&mut head).await.unwrap_or(0);
    if filled == 0 {
        let detail = match stderr.as_mut() {
            Some(e) => {
                let mut buf = String::new();
                let _ = e.read_to_string(&mut buf).await;
                buf.lines().last().unwrap_or_default().trim().to_string()
            }
            None => String::new(),
        };
        let _ = child.wait().await;
        tracing::warn!(item = %item.id, path = %abs, error = %detail, "download remux produced no output");
        return Err(json_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            &if detail.is_empty() {
                "this title could not be converted for download".to_string()
            } else {
                format!("this title could not be converted for download: {detail}")
            },
        ));
    }
    head.truncate(filled);

    // Reap the child off to the side, draining stderr so a chatty ffmpeg can't block
    // on a full pipe. The permit rides along so the slot returns when the process is
    // gone, not when the handler returns.
    let item_id = item.id.clone();
    tokio::spawn(async move {
        let mut detail = String::new();
        if let Some(mut e) = stderr {
            let _ = e.read_to_string(&mut detail).await;
        }
        match child.wait().await {
            Ok(status) if !status.success() => {
                tracing::warn!(item = %item_id, %status, error = %detail.trim(), "download remux exited non-zero");
            }
            _ => {}
        }
        drop(permit);
    });

    let sink = byte_sink(&state, &headers, &addr);
    let body = crate::infra::stream::CountingReader::new(
        std::io::Cursor::new(head).chain(stdout),
        sink,
    );
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "video/mp4")
        .header(header::CONTENT_DISPOSITION, content_disposition(&item.title))
        .body(Body::from_stream(tokio_util::io::ReaderStream::new(body)))
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, &format!("response build failed: {e}")))
}

// HTTP header values are ISO-8859-1, so `filename` is transliterated to ASCII and
// the real title rides in the RFC 5987 `filename*` form.
fn content_disposition(title: &str) -> String {
    let ascii: String = title
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == ' ' || c == '-' { c } else { '_' })
        .collect();
    let ascii = ascii.trim();
    // A title with nothing transliterable becomes bare underscores; prefer generic.
    let ascii = if ascii.chars().any(|c| c.is_ascii_alphanumeric()) { ascii } else { "download" };
    let encoded: String = title
        .bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~') {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect();
    format!("attachment; filename=\"{ascii}.mp4\"; filename*=UTF-8''{encoded}.mp4")
}

#[derive(Debug, Deserialize)]
pub struct StreamQuery {
    pub file: Option<String>,
}

/// `GET /api/items/:id/stream` (optional `?file=<fileId>`) → range-streamed
/// original file. Without `?file`, the item's default/best file is served.
pub async fn stream_item(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    Query(q): Query<StreamQuery>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<Response, Response> {
    let item = query(&state.db, move |pool| db::get_item(&pool, &id))
        .await?
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "item not found"))?;
    let abs_path = pick_file_path(&item, q.file.as_deref());
    let sink = byte_sink(&state, &headers, &addr);
    Ok(stream_or_demo_error(abs_path.as_deref(), &headers, sink).await)
}

fn pick_file_path(item: &MediaItem, file_id: Option<&str>) -> Option<String> {
    if let Some(fid) = file_id {
        if let Some(f) = item.files.iter().find(|f| f.id == fid) {
            return f.abs_path.clone();
        }
    }
    item.abs_path.clone()
}

/// `GET /api/items/:id/hls/:mode/:anchor/:audio/index.m3u8` (mode = `copy`|`aac`|
/// `aac-standard`|`aac-night`, anchor = start seconds for input `-ss`, audio =
/// audio-relative track index) → one media playlist muxing video with that single
/// audio track. Each (mode, anchor, audio) is its own session with its own child
/// URLs, so switching language means reloading with a different `audio`.
pub async fn hls_master(
    State(state): State<SharedState>,
    Path((id, mode, anchor, audio)): Path<(String, String, u64, u32)>,
) -> Response {
    let Some(mode) = StreamMode::parse(&mode) else {
        return json_error(StatusCode::BAD_REQUEST, "bad mode");
    };
    let Some(item) = load_item(&state, id).await else {
        return json_error(StatusCode::NOT_FOUND, "item not found");
    };
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
        return json_error(StatusCode::NOT_FOUND, "media file unavailable (mount offline?)");
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
        None => json_error(StatusCode::INTERNAL_SERVER_ERROR, "HLS remux unavailable (is ffmpeg installed?)"),
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
                if immutable { "public, max-age=31536000, immutable" } else { "no-store" },
            )
            .body(Body::from(bytes))
            .unwrap()
        }
        // A segment that has not been produced yet 404s the same way one that was
        // pruned does, so the miss must never be cached: the URL becomes valid.
        None => {
            let mut resp = json_error(StatusCode::NOT_FOUND, "segment not found (session expired?)");
            resp.headers_mut().insert(header::CACHE_CONTROL, header::HeaderValue::from_static("no-store"));
            resp
        }
    }
}

async fn load_item(state: &SharedState, id: String) -> Option<MediaItem> {
    query(&state.db, move |pool| db::get_item(&pool, &id)).await.ok().flatten()
}

fn playlist_response(body: String) -> Response {
    Response::builder()
        .header(header::CONTENT_TYPE, "application/vnd.apple.mpegurl")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(body))
        .unwrap()
}

/// `GET /api/items/:id/storyboard` → the sprite-sheet manifest mapping a cursor
/// time to a tile. 202 `{"status":"pending"}` while generating (the client polls).
pub async fn storyboard(State(state): State<SharedState>, Path(id): Path<String>) -> Response {
    let Some(item) = load_item(&state, id).await else {
        return json_error(StatusCode::NOT_FOUND, "item not found");
    };
    use crate::infra::storyboard::Status;
    match state.storyboard.get(&item).await {
        Status::Ready(m) => json_no_store(StatusCode::OK, serde_json::to_vec(&m).unwrap_or_default()),
        Status::Pending => json_no_store(StatusCode::ACCEPTED, br#"{"status":"pending"}"#.to_vec()),
        Status::Unavailable => json_error(StatusCode::NOT_FOUND, "storyboard unavailable"),
    }
}

/// `GET /api/items/:id/storyboard.img` → the cached sprite sheet, 404 until it is
/// generated. Cached immutably; the manifest's `?v=<key>` busts it.
pub async fn storyboard_image(State(state): State<SharedState>, Path(id): Path<String>) -> Response {
    let Some(item) = load_item(&state, id).await else {
        return json_error(StatusCode::NOT_FOUND, "item not found");
    };
    match state.storyboard.sheet(&item).await {
        Some((bytes, content_type)) => Response::builder()
            .header(header::CONTENT_TYPE, content_type)
            .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
            .body(Body::from(bytes))
            .unwrap(),
        None => json_error(StatusCode::NOT_FOUND, "storyboard not generated"),
    }
}

fn json_no_store(status: StatusCode, body: Vec<u8>) -> Response {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(body))
        .unwrap()
}

/// `GET /api/items/:id/subtitles/:track` → an embedded text subtitle stream as
/// WebVTT. `track` is the 0-based subtitle index (a trailing `.vtt` is allowed);
/// image subtitles (PGS/VobSub) can't convert and return 404.
pub async fn subtitles(
    State(state): State<SharedState>,
    Path((id, track)): Path<(String, String)>,
) -> Response {
    let index: usize = match track.trim_end_matches(".vtt").parse() {
        Ok(n) => n,
        Err(_) => return json_error(StatusCode::BAD_REQUEST, "invalid subtitle index"),
    };

    let item = match query(&state.db, move |pool| db::get_item(&pool, &id)).await {
        Ok(Some(item)) => item,
        Ok(None) => return json_error(StatusCode::NOT_FOUND, "item not found"),
        Err(resp) => return resp,
    };
    let Some(abs) = item.abs_path.clone() else {
        return json_error(StatusCode::NOT_FOUND, "no media file for item");
    };

    // Extracting a text subtitle reads the whole file (cues are interleaved), so
    // cache per (file, mtime, track). Computing the key stats the file, which on a
    // slow mount would block the tokio worker.
    let data_dir = state.config.data_dir.clone();
    let cache = {
        let (abs, data_dir) = (abs.clone(), data_dir.clone());
        match tokio::task::spawn_blocking(move || subtitles::cache_path(&data_dir, &abs, index)).await {
            Ok(p) => p,
            Err(_) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, "subtitle cache error"),
        }
    };
    if let Ok(bytes) = tokio::fs::read(&cache).await {
        return vtt_response(bytes);
    }
    // Cache miss: demux once and warm every text track. The per-file lock joins an
    // extraction already in flight instead of demuxing in parallel.
    let subs = item.subtitles.clone();
    let (abs2, data_dir2) = (abs.clone(), data_dir.clone());
    let _ = tokio::task::spawn_blocking(move || {
        subtitles::extract_pending_locked(&data_dir2, &abs2, &subs, &|| false)
    })
    .await;
    if let Ok(bytes) = tokio::fs::read(&cache).await {
        return vtt_response(bytes);
    }
    // `item.subtitles` metadata can be empty or stale, so the batch pass may not have
    // covered this index; extract it alone, codec-agnostically.
    if let Some(bytes) = extract_webvtt(&abs, index).await {
        if let Some(dir) = cache.parent() {
            let _ = tokio::fs::create_dir_all(dir).await;
        }
        let _ = tokio::fs::write(&cache, &bytes).await;
        return vtt_response(bytes);
    }
    json_error(StatusCode::NOT_FOUND, "subtitle unavailable (image-based or missing)")
}

fn vtt_response(bytes: Vec<u8>) -> Response {
    Response::builder()
        .header(header::CONTENT_TYPE, "text/vtt; charset=utf-8")
        .header(header::CACHE_CONTROL, "public, max-age=86400")
        .body(Body::from(bytes))
        .unwrap()
}

/// Transcodes one text subtitle stream to WebVTT, bounded by a timeout. This
/// single-track variant backs subtitle translation; playback extraction goes
/// through [`subtitles::extract_batch_blocking`].
pub(crate) async fn extract_webvtt(path: &str, index: usize) -> Option<Vec<u8>> {
    let child = tokio::process::Command::new("ffmpeg")
        .args(["-v", "error", "-nostdin", "-i"])
        .arg(path)
        .args(["-map", &format!("0:s:{index}"), "-f", "webvtt", "pipe:1"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .ok()?;

    // On timeout the future is dropped, which via kill_on_drop kills ffmpeg.
    let out = tokio::time::timeout(subtitles::timeout_for(path), child.wait_with_output())
        .await
        .ok()?
        .ok()?;
    if out.status.success() && !out.stdout.is_empty() {
        Some(out.stdout)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_mode_variants() {
        assert_eq!(StreamMode::parse("copy"), Some(StreamMode::Copy));
        assert_eq!(StreamMode::parse("aac"), Some(StreamMode::Aac));
        assert_eq!(StreamMode::parse("aac-standard"), Some(StreamMode::AacStandard));
        assert_eq!(StreamMode::parse("aac-night"), Some(StreamMode::AacNight));
        assert_eq!(StreamMode::parse("bogus"), None);
    }

    fn track(index: u32, codec: &str) -> crate::model::AudioStream {
        crate::model::AudioStream {
            index,
            codec: codec.into(),
            channels: None,
            language: None,
            title: None,
            default: false,
        }
    }

    #[test]
    fn download_copy_gate_honors_safe_set_and_client_set() {
        assert!(download_copies_audio(Some("eac3"), None));
        assert!(!download_copies_audio(Some("dts"), None));
        assert!(!download_copies_audio(None, None));
        assert!(download_copies_audio(Some("aac"), Some("aac")));
        assert!(!download_copies_audio(Some("eac3"), Some("aac")));
        assert!(download_copies_audio(Some("ac3"), Some("aac, AC3")));
        // `?copy=` (present, empty) means the device decodes none of them.
        assert!(!download_copies_audio(Some("aac"), Some("")));
        assert!(!download_copies_audio(Some("eac3"), Some("")));
    }

    #[test]
    fn download_audio_args_unprobed_fallback() {
        assert_eq!(
            download_audio_args(&[], Some("aac"), None),
            ["-map", "0:a:0?", "-c:a", "copy"]
        );
        assert_eq!(
            download_audio_args(&[], Some("dts"), None),
            ["-map", "0:a:0?", "-c:a", "aac", "-ac:a", "2", "-b:a", "192k"]
        );
    }

    #[test]
    fn content_disposition_is_ascii_with_utf8_filename_star() {
        let cd = content_disposition("Amélie");
        assert!(cd.is_ascii(), "header value must be ASCII: {cd}");
        assert!(cd.contains("filename=\"Am_lie.mp4\""));
        assert!(cd.contains("filename*=UTF-8''Am%C3%A9lie.mp4"));
        assert!(content_disposition("???").contains("filename=\"download.mp4\""));
    }

    #[test]
    fn download_audio_args_maps_every_track_with_per_track_codecs() {
        let tracks = [track(0, "eac3"), track(1, "dts"), track(2, "aac")];
        assert_eq!(
            download_audio_args(&tracks, Some("eac3"), None),
            [
                "-map", "0:a:0", "-c:a:0", "copy",
                "-map", "0:a:1", "-c:a:1", "aac", "-ac:a:1", "2", "-b:a:1", "192k",
                "-map", "0:a:2", "-c:a:2", "copy",
            ]
        );
    }

    #[test]
    fn download_audio_args_client_set_forces_transcode_and_sorts_by_index() {
        let tracks = [track(1, "aac"), track(0, "eac3")];
        assert_eq!(
            download_audio_args(&tracks, None, Some("aac")),
            [
                "-map", "0:a:0", "-c:a:0", "aac", "-ac:a:0", "2", "-b:a:0", "192k",
                "-map", "0:a:1", "-c:a:1", "copy",
            ]
        );
    }
}
