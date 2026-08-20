//! The offline download: the whole title remuxed to one fragmented MP4 by a
//! per-request ffmpeg.

use std::net::SocketAddr;

use axum::body::Body;
use axum::extract::{ConnectInfo, Path, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::Response;
use serde::Deserialize;

use crate::api::error::json_error;
use crate::api::util::query;
use crate::db;
use crate::state::SharedState;
use tokio::io::AsyncReadExt;

mod audio_args;

use audio_args::download_audio_args;
use super::byte_sink;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_disposition_is_ascii_with_utf8_filename_star() {
        let cd = content_disposition("Amélie");
        assert!(cd.is_ascii(), "header value must be ASCII: {cd}");
        assert!(cd.contains("filename=\"Am_lie.mp4\""));
        assert!(cd.contains("filename*=UTF-8''Am%C3%A9lie.mp4"));
        assert!(content_disposition("???").contains("filename=\"download.mp4\""));
    }
}
