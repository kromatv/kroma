use axum::body::{to_bytes, Body};
use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::Response;
use kroma_media::program::Session;
use kroma_media::Credential;

use crate::api::error::json_error;
use crate::api::media_ticket::{MediaViewer, TicketQuery};
use crate::api::visibility;
use crate::state::SharedState;

pub(super) fn valid_source(source: &str) -> bool {
    if source.parse::<usize>().is_ok() {
        return true;
    }
    source.strip_prefix("g:").is_some_and(|id| {
        !id.is_empty()
            && id.len() <= 128
            && id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    })
}

pub(super) fn master(
    mut response: Response,
    id: &str,
    source: &str,
    session: Session,
    credential: &Credential,
) -> Response {
    let seconds = |name| {
        response
            .headers()
            .get(name)?
            .to_str()
            .ok()?
            .parse::<f64>()
            .ok()
    };
    let start = seconds("X-Hls-Start").unwrap_or(0.0);
    let Some(duration) = seconds("X-Media-Duration").filter(|d| d.is_finite() && *d > start) else {
        return response;
    };
    let remaining = (duration - start).ceil() as u64;
    let query = credential.query();
    let media = format!(
        "/api/items/{id}/hls/{}/{}/{}/index.m3u8{query}",
        session.mode.token(),
        session.anchor,
        session.audio,
    );
    let subtitles = format!("/api/items/{id}/subtitles/{source}/{remaining}/index.m3u8{query}");
    let body = master_playlist(&media, &subtitles);
    response.headers_mut().remove(header::CONTENT_LENGTH);
    response.map(|_| Body::from(body))
}

fn master_playlist(media: &str, subtitles: &str) -> String {
    format!(
        "#EXTM3U\n#EXT-X-VERSION:7\n\
         #EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID=\"subs\",NAME=\"Subtitles\",DEFAULT=YES,AUTOSELECT=YES,URI=\"{subtitles}\"\n\
         #EXT-X-STREAM-INF:BANDWIDTH=30000000,SUBTITLES=\"subs\"\n{media}\n"
    )
}

pub(super) async fn rendition(
    State(state): State<SharedState>,
    MediaViewer(viewer): MediaViewer,
    Path((id, source, duration, file)): Path<(String, String, u64, String)>,
    axum::extract::Query(ticket): axum::extract::Query<TicketQuery>,
) -> Response {
    if !valid_source(&source) || duration == 0 {
        return json_error(StatusCode::BAD_REQUEST, "invalid subtitle rendition");
    }
    if let Err(response) = visibility::gate_item(&state, &viewer, &id).await {
        return response;
    }
    match file.as_str() {
        "index.m3u8" => {
            let body = format!(
                "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:{duration}\n\
                 #EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n\
                 #EXTINF:{duration},\ncues.vtt{}\n#EXT-X-ENDLIST\n",
                ticket.credential().query(),
            );
            Response::builder()
                .header(header::CONTENT_TYPE, "application/vnd.apple.mpegurl")
                .header(header::CACHE_CONTROL, "no-store")
                .body(Body::from(body))
                .unwrap()
        }
        "cues.vtt" => {
            let response = if let Some(generated) = source.strip_prefix("g:") {
                crate::api::online_subs::file(
                    State(state),
                    MediaViewer(viewer),
                    Path((id, generated.to_string())),
                )
                .await
            } else {
                super::subtitles(State(state), MediaViewer(viewer), Path((id, source))).await
            };
            if !response.status().is_success() {
                return response;
            }
            let Ok(bytes) = to_bytes(response.into_body(), 32 * 1024 * 1024).await else {
                return json_error(StatusCode::UNPROCESSABLE_ENTITY, "subtitle too large");
            };
            match timestamped_vtt(&bytes) {
                Some(body) => super::vtt_response(body.into_bytes()),
                None => json_error(StatusCode::UNPROCESSABLE_ENTITY, "invalid WebVTT"),
            }
        }
        _ => json_error(StatusCode::NOT_FOUND, "subtitle rendition not found"),
    }
}

fn timestamped_vtt(bytes: &[u8]) -> Option<String> {
    let raw = std::str::from_utf8(bytes)
        .ok()?
        .trim_start_matches('\u{feff}');
    let mut lines = raw.lines();
    if !lines.next()?.starts_with("WEBVTT") {
        return None;
    }
    let cues = lines
        .filter(|line| !line.starts_with("X-TIMESTAMP-MAP="))
        .collect::<Vec<_>>()
        .join("\n");
    // Anchored remuxes retain source PTS (-copyts), including reused session cuts.
    Some(format!(
        "WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0\n\n{}\n",
        cues.trim_start()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_cannot_inject_playlist_lines_or_name_arbitrary_files() {
        assert!(valid_source("2"));
        assert!(valid_source("g:sub_123"));
        for source in ["", "g:", "g:../file", "2\n#EXT-X-ENDLIST", "g:a\"b"] {
            assert!(!valid_source(source));
        }
    }

    #[test]
    fn every_rendition_keeps_the_media_ticket() {
        let body = master_playlist("index.m3u8?t=token", "/subtitles/0/600/index.m3u8?t=token");
        assert!(body.contains("TYPE=SUBTITLES"));
        assert_eq!(body.matches("t=token").count(), 2);
    }

    #[test]
    fn cues_keep_the_absolute_source_clock_after_a_resume_or_session_cut() {
        let body = timestamped_vtt(b"WEBVTT\n\n00:24:01.000 --> 00:24:03.000\nHello\n").unwrap();
        assert!(body.contains("X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0"));
        assert!(body.contains("00:24:01.000 --> 00:24:03.000\nHello"));
        assert!(!body.contains("00:00:01.000 -->"));
    }
}
