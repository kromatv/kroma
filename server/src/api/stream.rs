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
use crate::infra::stream::stream_or_demo_error;
use crate::infra::subtitles;
use crate::model::MediaItem;
use crate::services::playback;
use crate::services::settings;
use crate::state::SharedState;
use axum::routing::get;
use axum::Router;

mod download;
mod hls;

use download::download_item;
use hls::{hls_file, hls_master};

fn byte_sink(
    state: &SharedState,
    headers: &HeaderMap,
    addr: &SocketAddr,
) -> crate::infra::metrics::ByteSink {
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
        .route(
            "/items/{id}/hls/{mode}/{anchor}/{audio}/index.m3u8",
            get(hls_master),
        )
        .route(
            "/items/{id}/hls/{mode}/{anchor}/{audio}/{file}",
            get(hls_file),
        )
        .route("/items/{id}/storyboard", get(storyboard))
        .route("/items/{id}/storyboard.img", get(storyboard_image))
        .route("/items/{id}/subtitles/{track}", get(subtitles))
}

/// Session-gated media routes: the download is a plain fetch, so it can carry a
/// bearer - and must, because each call holds an ffmpeg for a whole film.
pub fn protected_routes() -> Router<SharedState> {
    Router::new().route("/items/{id}/download", get(download_item))
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

async fn load_item(state: &SharedState, id: String) -> Option<MediaItem> {
    query(&state.db, move |pool| db::get_item(&pool, &id))
        .await
        .ok()
        .flatten()
}

/// `GET /api/items/:id/storyboard` → the sprite-sheet manifest mapping a cursor
/// time to a tile. 202 `{"status":"pending"}` while generating (the client polls).
pub async fn storyboard(State(state): State<SharedState>, Path(id): Path<String>) -> Response {
    let Some(item) = load_item(&state, id).await else {
        return json_error(StatusCode::NOT_FOUND, "item not found");
    };
    use crate::infra::storyboard::Status;
    match state.storyboard.get(&item).await {
        Status::Ready(m) => {
            json_no_store(StatusCode::OK, serde_json::to_vec(&m).unwrap_or_default())
        }
        Status::Pending => json_no_store(StatusCode::ACCEPTED, br#"{"status":"pending"}"#.to_vec()),
        Status::Unavailable => json_error(StatusCode::NOT_FOUND, "storyboard unavailable"),
    }
}

/// `GET /api/items/:id/storyboard.img` → the cached sprite sheet, 404 until it is
/// generated. Cached immutably; the manifest's `?v=<key>` busts it.
pub async fn storyboard_image(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> Response {
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
        match tokio::task::spawn_blocking(move || subtitles::cache_path(&data_dir, &abs, index))
            .await
        {
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
    json_error(
        StatusCode::NOT_FOUND,
        "subtitle unavailable (image-based or missing)",
    )
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
