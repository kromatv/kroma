use super::*;
use crate::infra::hls::{AudioMode, VideoMode};

fn mode(video: VideoMode, audio: AudioMode) -> StreamMode {
    StreamMode::new(video, audio)
}

#[test]
fn redirect_path_swaps_only_the_mode_segment() {
    assert_eq!(
        hls_master_path("abc123", mode(VideoMode::Copy, AudioMode::Aac), 30, 1, None),
        "/api/items/abc123/hls/aac/30/1/index.m3u8"
    );
    assert_eq!(
        hls_master_path("tv:s1e2", mode(VideoMode::Copy, AudioMode::Aac), 0, 0, None),
        "/api/items/tv:s1e2/hls/aac/0/0/index.m3u8"
    );
    assert_eq!(
        hls_master_path(
            "abc123",
            mode(VideoMode::H264, AudioMode::AacNight),
            30,
            1,
            None
        ),
        "/api/items/abc123/hls/h264-aac-night/30/1/index.m3u8"
    );
}

#[test]
fn a_redirect_carries_the_credential_the_player_arrived_with() {
    assert_eq!(
        hls_master_path(
            "abc123",
            mode(VideoMode::H264, AudioMode::Aac),
            0,
            0,
            Some("dev.999.sig")
        ),
        "/api/items/abc123/hls/h264-aac/0/0/index.m3u8?t=dev.999.sig"
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
        hls_master_path("abc123", effective, 30, 1, None),
        "/api/items/abc123/hls/h264-aac/30/1/index.m3u8"
    );
    assert_eq!(
        effective
            .for_client_audio(Some("dts"), None)
            .for_client_video(Some("hevc"), None),
        effective
    );
}
