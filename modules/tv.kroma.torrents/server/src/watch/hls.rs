//! The core's proxy follows a `3xx` itself rather than handing it to the
//! browser, so this pair cannot redirect: the playlist answered IS the mode that
//! will play, and `X-Hls-Mode` names it.

use axum::extract::{Path, Query, State};
use axum::http::{HeaderValue, StatusCode};
use axum::response::Response;
use axum::routing::get;
use axum::Router;

use kroma_module_sdk::host::{json_error, HostStorage};
use kroma_module_sdk::media::hls::StreamMode;
use kroma_module_sdk::media::program::{self, ClientDecoders, Program, Session};
use kroma_module_sdk::media::{Credential, Unmetered};

use super::file::WatchedFile;
use super::listing::watched_file;
use super::source::{presented, Presented};
use super::{engine, manager};

const TICKET_PARAM: &str = "t";
const MODE_HEADER: &str = "X-Hls-Mode";

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route(
            "/watch/{id}/files/{file}/hls/{mode}/{anchor}/{audio}/index.m3u8",
            get(master::<S>),
        )
        .route(
            "/watch/{id}/files/{file}/hls/{mode}/{anchor}/{audio}/{name}",
            get(segment::<S>),
        )
}

async fn master<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    Path((id, file, mode, anchor, audio)): Path<(String, usize, String, u64, u32)>,
    Query(decoders): Query<ClientDecoders>,
    Query(carried): Query<Presented>,
) -> Result<Response, Response> {
    let mode =
        StreamMode::parse(&mode).ok_or_else(|| json_error(StatusCode::BAD_REQUEST, "bad mode"))?;
    let watched = watched_file(id, file)?;
    let downloads = manager(&state)?;
    let token = presented(&carried, &downloads, &watched)?;
    let watch = engine(&state)?;
    let probed = watch.probe(&downloads, &watched).await?;
    let program_id = watched.to_string();
    let program = Program {
        id: &program_id,
        video: probed.video.as_ref(),
        audio_tracks: &probed.audio_tracks,
        duration_ms: probed.duration_ms,
    };
    let effective = program.effective_mode(mode, audio, &decoders);
    let input = watch.input(&downloads, &watched).await?;
    let session = Session {
        mode: effective,
        anchor,
        audio,
    };
    let credential = Credential::new(TICKET_PARAM, Some(&token));
    let base = children_base(&watched, effective, anchor, audio);
    let mut playlist = program
        .master(&watch.hls, &input, session, &base, &credential, Unmetered)
        .await
        .ok_or_else(|| {
            json_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "the stream has produced no playlist yet",
            )
        })?;
    if let Ok(named) = HeaderValue::from_str(&effective.token()) {
        playlist.headers_mut().insert(MODE_HEADER, named);
    }
    Ok(playlist)
}

async fn segment<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    Path((id, file, mode, anchor, audio, name)): Path<(String, usize, String, u64, u32, String)>,
    Query(carried): Query<Presented>,
) -> Result<Response, Response> {
    let mode =
        StreamMode::parse(&mode).ok_or_else(|| json_error(StatusCode::BAD_REQUEST, "bad mode"))?;
    let watched = watched_file(id, file)?;
    let downloads = manager(&state)?;
    presented(&carried, &downloads, &watched)?;
    let session = Session {
        mode,
        anchor,
        audio,
    };
    let watch = engine(&state)?;
    Ok(program::file(&watch.hls, &watched.to_string(), session, &name, Unmetered).await)
}

fn children_base(watched: &WatchedFile, mode: StreamMode, anchor: u64, audio: u32) -> String {
    format!(
        "/api/module/{}/watch/{}/files/{}/hls/{}/{anchor}/{audio}/",
        crate::MODULE_ID,
        watched.download,
        watched.file,
        mode.token()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    use kroma_module_sdk::domain::VideoStream;
    use kroma_module_sdk::host::testing::StubHost;
    use kroma_module_sdk::media::hls::{AudioMode, VideoMode};
    use kroma_module_sdk::media::probe::ProbeResult;

    use crate::downloads::test_support::{added, manager_over};
    use crate::watch::test_support::{anonymous, watch_engine};

    const AVPLAYER: &str = "hevc,h264";

    fn watched() -> WatchedFile {
        WatchedFile::new("22e86113ba9a6db4".into(), 5).unwrap()
    }

    fn arriving_h264(bit_depth: Option<u32>) -> ProbeResult {
        ProbeResult {
            video: Some(VideoStream {
                codec: "h264".into(),
                width: Some(1920),
                height: Some(1080),
                hdr: false,
                bit_depth,
                hdr_format: None,
                dolby_vision_profile: None,
                color: None,
            }),
            ..ProbeResult::default()
        }
    }

    fn played_as(probed: &ProbeResult, declared_video: &str) -> StreamMode {
        let program = Program {
            id: "22e86113ba9a6db4:5",
            video: probed.video.as_ref(),
            audio_tracks: &probed.audio_tracks,
            duration_ms: None,
        };
        let declared = ClientDecoders {
            video: Some(declared_video.to_string()),
            ..ClientDecoders::default()
        };

        program.effective_mode(
            StreamMode::new(VideoMode::Copy, AudioMode::Copy),
            0,
            &declared,
        )
    }

    #[test]
    fn a_ten_bit_file_still_arriving_is_re_encoded_for_a_decoder_that_stops_at_eight() {
        let probed = arriving_h264(Some(10));

        let mode = played_as(&probed, AVPLAYER);

        assert_eq!(mode.video, VideoMode::H264);
    }

    #[test]
    fn an_eight_bit_file_still_arriving_is_copied_to_the_same_decoder() {
        let probed = arriving_h264(Some(8));

        let mode = played_as(&probed, AVPLAYER);

        assert_eq!(mode.video, VideoMode::Copy);
    }

    #[test]
    fn a_ten_bit_file_is_copied_to_a_decoder_that_declared_it_draws_one() {
        let probed = arriving_h264(Some(10));

        let mode = played_as(&probed, "h264,h26410bit");

        assert_eq!(mode.video, VideoMode::Copy);
    }

    #[test]
    fn every_child_of_a_playlist_is_named_in_full_under_the_mode_that_will_play() {
        let mode = StreamMode::new(VideoMode::H264, AudioMode::Aac);

        let base = children_base(&watched(), mode, 600, 1);

        assert_eq!(
            base,
            "/api/module/tv.kroma.torrents/watch/22e86113ba9a6db4/files/5/hls/h264-aac/600/1/"
        );
    }

    #[test]
    fn a_stream_copy_names_the_mode_the_url_carries_rather_than_an_empty_segment() {
        let mode = StreamMode::new(VideoMode::Copy, AudioMode::Aac);

        let base = children_base(&WatchedFile::new("d1".into(), 0).unwrap(), mode, 0, 0);

        assert_eq!(
            base,
            "/api/module/tv.kroma.torrents/watch/d1/files/0/hls/aac/0/0/"
        );
    }

    #[tokio::test]
    async fn a_playlist_asked_for_with_no_token_is_refused_before_anything_is_started() {
        let (host, downloads) = manager_over("watch-hls-anon", &[added("d1")]);
        let engine = watch_engine(&host);
        let host = host.with_service(downloads).with_service(engine);

        let refused = anonymous(
            routes::<StubHost>(),
            host,
            "GET",
            "/watch/d1/files/0/hls/aac/0/0/index.m3u8",
        )
        .await;

        assert_eq!(refused, StatusCode::UNAUTHORIZED);
    }
}
