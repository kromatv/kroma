//! One HLS program served out of the engine, whatever it reads: the mode the
//! client's declared decoders settle it on, its media playlist, and the files
//! ffmpeg writes for it.

use axum::http::{header, HeaderValue, StatusCode};
use axum::response::Response;
use kroma_module_wire::{AudioStream, VideoStream};
use serde::Deserialize;

use crate::hls::{HlsEngine, StreamMode};
use crate::json_error::json_error;
use crate::stream::metered_body;
use crate::{playlist, ByteMeter, Credential};

/// What a client says its decoder takes, read off the query of every request for
/// a program. `copy` names the audio codecs it can decode or pass through, so
/// the server can refuse to stream-copy one the device would play silent;
/// `video` does the same for the picture, which would otherwise play black.
/// Absent means no declared capability (the requested mode is trusted); present
/// but empty means the client decodes none, so any copied stream is transcoded.
/// `maxw` / `maxh` are the largest picture its decoder accepts, both axes, and
/// absent leaves the source's own size standing.
#[derive(Debug, Default, Deserialize)]
pub struct ClientDecoders {
    pub copy: Option<String>,
    pub video: Option<String>,
    pub maxw: Option<u32>,
    pub maxh: Option<u32>,
}

/// One session of a program: the mode it is produced in, the second it starts
/// from, and the audio track muxed into it. Each is its own ffmpeg with its own
/// segment URLs.
#[derive(Clone, Copy, Debug)]
pub struct Session {
    pub mode: StreamMode,
    pub anchor: u64,
    pub audio: u32,
}

/// What the engine needs to know about one program to pick its mode and start
/// its ffmpeg. `id` names its sessions, so two programs must never share one.
pub struct Program<'a> {
    pub id: &'a str,
    pub video: Option<&'a VideoStream>,
    pub audio_tracks: &'a [AudioStream],
    pub duration_ms: Option<u64>,
}

impl Program<'_> {
    fn frame(&self) -> Option<(u32, u32)> {
        self.video.and_then(|v| v.width.zip(v.height))
    }

    /// The mode whose picture and sound will actually play on the client, for the
    /// `audio`-th track. Both axes are resolved before a caller compares it with
    /// the asked mode, so one answer settles them together.
    pub fn effective_mode(
        &self,
        mode: StreamMode,
        audio: u32,
        declared: &ClientDecoders,
    ) -> StreamMode {
        let selected_codec = self
            .audio_tracks
            .iter()
            .find(|t| t.index == audio)
            .map(|t| t.codec.as_str());
        mode.for_client_audio(selected_codec, declared.copy.as_deref())
            .for_client_video(
                self.video.map(|v| v.codec.as_str()),
                self.video.and_then(|v| v.bit_depth),
                declared.video.as_deref(),
            )
            .for_client_frame(self.frame(), declared.maxw.zip(declared.maxh))
    }

    /// The media playlist of `session`, starting it over `input` (a path or a URL
    /// ffmpeg opens) when none runs, with every child URI hung off `base` and
    /// carrying `credential`. `None` when ffmpeg produced no playlist in time.
    pub async fn master<M: ByteMeter>(
        &self,
        engine: &HlsEngine,
        input: &str,
        session: Session,
        base: &str,
        credential: &Credential,
        meter: M,
    ) -> Option<Response> {
        let Session {
            mode,
            anchor,
            audio,
        } = session;
        let (body, start) = engine
            .master(self.id, input, audio, mode, anchor, self.frame())
            .await?;
        let body = playlist::with_base(&body, base, credential);
        let mut resp = playlist_response(body, meter);
        // `X-Hls-Start` is the real start (the keyframe at-or-before the anchor, where
        // `-noaccurate_seek` begins); the client needs it to align clock and subtitles.
        insert_seconds(&mut resp, "X-Hls-Start", start);
        // `X-Media-Duration` is the true total length in seconds: without it a
        // client missing `durationMs` would size its slider to the growing EVENT
        // playlist's live edge.
        let duration_ms = match self.duration_ms {
            Some(d) => Some(d),
            None => engine.input_duration_ms(input).await,
        };
        if let Some(secs) = duration_ms
            .map(|ms| ms as f64 / 1000.0)
            .filter(|s| *s > 0.0)
        {
            insert_seconds(&mut resp, "X-Media-Duration", secs);
        }
        Some(resp)
    }
}

/// A child file (init or media segment) of `session` of program `id`. A
/// not-yet-produced segment is polled for until ffmpeg flushes it.
pub async fn file<M: ByteMeter>(
    engine: &HlsEngine,
    id: &str,
    session: Session,
    name: &str,
    meter: M,
) -> Response {
    let immutable = !name.ends_with(".m3u8");
    let Session {
        mode,
        anchor,
        audio,
    } = session;
    match engine.file(id, mode, anchor, audio, name).await {
        Some((bytes, ct)) => Response::builder()
            .header(header::CONTENT_TYPE, ct)
            .header(header::CONTENT_LENGTH, bytes.len())
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
            .body(metered_body(std::io::Cursor::new(bytes), meter))
            .unwrap(),
        // A segment that has not been produced yet 404s the same way one that was
        // pruned does, so the miss must never be cached: the URL becomes valid.
        None => {
            let mut resp = json_error(
                StatusCode::NOT_FOUND,
                "segment not found (session expired?)",
            );
            resp.headers_mut()
                .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            resp
        }
    }
}

fn insert_seconds(resp: &mut Response, name: &'static str, secs: f64) {
    if let Ok(v) = HeaderValue::from_str(&format!("{secs:.3}")) {
        resp.headers_mut().insert(name, v);
    }
}

fn playlist_response<M: ByteMeter>(body: String, meter: M) -> Response {
    let bytes = body.into_bytes();
    Response::builder()
        .header(header::CONTENT_TYPE, "application/vnd.apple.mpegurl")
        .header(header::CONTENT_LENGTH, bytes.len())
        .header(header::CACHE_CONTROL, "no-store")
        .body(metered_body(std::io::Cursor::new(bytes), meter))
        .unwrap()
}
