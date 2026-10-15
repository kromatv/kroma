use std::path::Path;

use axum::body::to_bytes;
use kroma_module_wire::{AudioStream, VideoStream};

use super::*;
use crate::hls::{AudioMode, Rung, VideoMode};
use crate::meter::Unmetered;

const COPY: StreamMode = StreamMode::new(VideoMode::Copy, AudioMode::Copy);

fn video(codec: &str, width: u32, height: u32, bit_depth: Option<u32>) -> VideoStream {
    VideoStream {
        codec: codec.into(),
        width: Some(width),
        height: Some(height),
        hdr: false,
        bit_depth,
        hdr_format: None,
        dolby_vision_profile: None,
        color: None,
    }
}

fn audio(index: u32, codec: &str) -> AudioStream {
    AudioStream {
        index,
        codec: codec.into(),
        channels: Some(2),
        language: Some("eng".into()),
        title: None,
        default: index == 0,
    }
}

fn program<'a>(video: Option<&'a VideoStream>, tracks: &'a [AudioStream]) -> Program<'a> {
    Program {
        id: "it1",
        video,
        audio_tracks: tracks,
        duration_ms: Some(8_000),
    }
}

fn engine(root: &Path) -> HlsEngine {
    HlsEngine::new(root.join("hls"), 2, 0)
}

async fn body_of(resp: Response) -> String {
    let bytes = to_bytes(resp.into_body(), 1 << 20).await.expect("read the body");
    String::from_utf8(bytes.to_vec()).expect("a text body")
}

#[test]
fn a_client_that_declares_nothing_is_served_the_mode_it_asked_for() {
    let tracks = [audio(0, "eac3")];
    let hevc = video("hevc", 3840, 2160, Some(10));

    let mode = program(Some(&hevc), &tracks).effective_mode(COPY, 0, &ClientDecoders::default());

    assert_eq!(mode, COPY);
}

#[test]
fn a_sound_the_device_cannot_decode_is_transcoded_rather_than_played_silent() {
    let tracks = [audio(0, "aac"), audio(1, "eac3")];
    let h264 = video("h264", 1920, 1080, Some(8));
    let declared = ClientDecoders {
        copy: Some("aac,mp3".into()),
        video: Some("h264".into()),
        ..Default::default()
    };

    let kept = program(Some(&h264), &tracks).effective_mode(COPY, 0, &declared);
    let refused = program(Some(&h264), &tracks).effective_mode(COPY, 1, &declared);

    assert_eq!(kept.audio, AudioMode::Copy);
    assert_eq!(refused.audio, AudioMode::Aac);
}

#[test]
fn a_picture_the_device_cannot_draw_is_re_encoded_rather_than_played_black() {
    let tracks = [audio(0, "aac")];
    let hevc = video("hevc", 1920, 1080, Some(10));
    let declared = ClientDecoders {
        copy: Some("aac".into()),
        video: Some("h264".into()),
        ..Default::default()
    };

    let mode = program(Some(&hevc), &tracks).effective_mode(COPY, 0, &declared);

    assert_eq!(mode.video, VideoMode::H264);
    assert_eq!(mode.audio, AudioMode::Copy);
}

#[test]
fn a_frame_over_what_the_decoder_takes_comes_down_to_a_rung_under_it() {
    let tracks = [audio(0, "aac")];
    let uhd = video("h264", 3840, 2160, Some(8));
    let declared = ClientDecoders {
        video: Some("h264".into()),
        maxw: Some(1920),
        maxh: Some(1080),
        ..Default::default()
    };

    let mode = program(Some(&uhd), &tracks).effective_mode(COPY, 0, &declared);

    assert_eq!(mode.video, VideoMode::H264At(Rung::P1080));
}

#[test]
fn a_program_with_no_probed_picture_has_no_frame_to_fit() {
    let tracks = [audio(0, "aac")];
    let declared = ClientDecoders {
        maxw: Some(640),
        maxh: Some(360),
        ..Default::default()
    };

    let mode = program(None, &tracks).effective_mode(COPY, 0, &declared);

    assert_eq!(mode, COPY);
}

#[tokio::test]
async fn a_program_answers_its_playlist_with_the_start_and_the_true_length() {
    let dir = kroma_testing::temp_dir("program-master");
    let input = kroma_testing::clip(dir.path());
    let engine = engine(dir.path());
    let tracks = [audio(0, "aac")];
    let session = Session {
        mode: COPY,
        anchor: 0,
        audio: 0,
    };

    let resp = program(None, &tracks)
        .master(
            &engine,
            input.to_str().unwrap(),
            session,
            &Credential::new("t", Some("tok")),
            Unmetered,
        )
        .await
        .expect("a playlist out of a file ffmpeg can read");

    assert_eq!(
        resp.headers().get(header::CONTENT_TYPE).unwrap(),
        "application/vnd.apple.mpegurl"
    );
    assert_eq!(resp.headers().get(header::CACHE_CONTROL).unwrap(), "no-store");
    assert_eq!(resp.headers().get("X-Hls-Start").unwrap(), "0.000");
    assert_eq!(resp.headers().get("X-Media-Duration").unwrap(), "8.000");
    let body = body_of(resp).await;
    assert!(body.contains("#EXT-X-TARGETDURATION"));
    assert!(body.contains("?t=tok"));
}

#[tokio::test]
async fn an_unprobed_program_takes_its_length_off_the_file_itself() {
    let dir = kroma_testing::temp_dir("program-probed");
    let input = kroma_testing::clip(dir.path());
    let engine = engine(dir.path());
    let tracks = [audio(0, "aac")];
    let mut unprobed = program(None, &tracks);
    unprobed.duration_ms = None;

    let resp = unprobed
        .master(
            &engine,
            input.to_str().unwrap(),
            Session {
                mode: COPY,
                anchor: 0,
                audio: 0,
            },
            &Credential::new("t", None),
            Unmetered,
        )
        .await
        .expect("a playlist out of a file ffmpeg can read");

    let length: f64 = resp
        .headers()
        .get("X-Media-Duration")
        .expect("the length ffprobe read")
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    assert!((4.0..6.0).contains(&length), "read {length}s off a five second clip");
}

#[tokio::test]
async fn a_segment_no_session_is_producing_is_a_miss_nothing_may_cache() {
    let dir = kroma_testing::temp_dir("program-gone");
    let engine = engine(dir.path());
    let session = Session {
        mode: COPY,
        anchor: 0,
        audio: 0,
    };

    let resp = file(&engine, "it1", session, "seg_00000.m4s", Unmetered).await;

    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    assert_eq!(resp.headers().get(header::CACHE_CONTROL).unwrap(), "no-store");
    assert!(body_of(resp).await.contains("session expired"));
}

#[tokio::test]
async fn a_segment_url_is_good_forever_and_a_playlist_never_is() {
    let dir = kroma_testing::temp_dir("program-file");
    let input = kroma_testing::clip(dir.path());
    let engine = engine(dir.path());
    let tracks = [audio(0, "aac")];
    let session = Session {
        mode: COPY,
        anchor: 0,
        audio: 0,
    };
    program(None, &tracks)
        .master(
            &engine,
            input.to_str().unwrap(),
            session,
            &Credential::new("t", None),
            Unmetered,
        )
        .await
        .expect("a playlist out of a file ffmpeg can read");

    let segment = file(&engine, "it1", session, "init.mp4", Unmetered).await;
    let playlist = file(&engine, "it1", session, "index.m3u8", Unmetered).await;

    assert_eq!(
        segment.headers().get(header::CACHE_CONTROL).unwrap(),
        "public, max-age=31536000, immutable"
    );
    assert_eq!(
        playlist.headers().get(header::CACHE_CONTROL).unwrap(),
        "no-store"
    );
    assert!(body_of(playlist).await.contains("#EXTM3U"));
}
