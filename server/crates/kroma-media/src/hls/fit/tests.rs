use super::*;

const fn copy() -> StreamMode {
    StreamMode::new(VideoMode::Copy, AudioMode::Copy)
}

const fn audio(audio: AudioMode) -> StreamMode {
    StreamMode::new(VideoMode::Copy, audio)
}

const fn re_encoded() -> StreamMode {
    StreamMode::new(VideoMode::H264, AudioMode::Copy)
}

// The Chromecast HD's own ceiling, which is square because its decoders
// declare one size limit for both axes.
const CHROMECAST_HD: (u32, u32) = (1920, 1920);

const AVPLAYER: &str = "hevc,h264";

#[test]
fn scales_a_source_larger_than_the_decoder_the_client_declared() {
    let scaled = copy().for_client_frame(Some((3840, 2160)), Some(CHROMECAST_HD));

    assert_eq!(scaled.video, VideoMode::H264At(Rung::P1080));
    assert_eq!(scaled.audio, AudioMode::Copy);
    assert_eq!(scaled.token(), "h264-1080-copy");
}

#[test]
fn scales_a_scope_frame_that_is_only_too_wide() {
    // 1604 rows clears a 1920 ceiling; 3840 columns do not.
    let scaled = copy().for_client_frame(Some((3840, 1604)), Some(CHROMECAST_HD));

    assert_eq!(scaled.video, VideoMode::H264At(Rung::P1080));
}

#[test]
fn leaves_a_picture_the_client_can_already_take() {
    assert_eq!(
        copy().for_client_frame(Some((1920, 1080)), Some(CHROMECAST_HD)),
        copy()
    );
    assert_eq!(copy().for_client_frame(Some((3840, 2160)), None), copy());
    assert_eq!(copy().for_client_frame(None, Some(CHROMECAST_HD)), copy());
}

#[test]
fn overrides_a_full_size_re_encode_too_because_it_is_just_as_unplayable() {
    let full = StreamMode::new(VideoMode::H264, AudioMode::Aac);

    let scaled = full.for_client_frame(Some((3840, 2160)), Some(CHROMECAST_HD));

    assert_eq!(scaled.video, VideoMode::H264At(Rung::P1080));
    assert_eq!(scaled.audio, AudioMode::Aac);
}

#[test]
fn drops_to_the_largest_rung_a_smaller_decoder_still_holds() {
    assert_eq!(
        copy()
            .for_client_frame(Some((3840, 2160)), Some((1280, 800)))
            .video,
        VideoMode::H264At(Rung::P720)
    );
    assert_eq!(
        copy()
            .for_client_frame(Some((3840, 2160)), Some((640, 480)))
            .video,
        VideoMode::Copy
    );
}

#[test]
fn copy_becomes_aac_when_the_client_cannot_decode_the_codec() {
    // The AC-3-only Android TV case: a copy request the device can't play.
    assert_eq!(
        copy().for_client_audio(Some("ac3"), Some("aac")),
        audio(AudioMode::Aac)
    );
}

#[test]
fn copy_stays_copy_when_the_client_can_decode_or_passthrough() {
    assert_eq!(
        copy().for_client_audio(Some("ac3"), Some("aac,ac3,eac3")),
        copy()
    );
    assert_eq!(
        copy().for_client_audio(Some("AC3"), Some("aac, ac3")),
        copy()
    );
}

#[test]
fn no_declared_capability_leaves_the_requested_mode_untouched() {
    assert_eq!(copy().for_client_audio(Some("ac3"), None), copy());
}

#[test]
fn an_empty_capability_set_transcodes_every_known_codec() {
    assert_eq!(
        copy().for_client_audio(Some("aac"), Some("")),
        audio(AudioMode::Aac)
    );
}

#[test]
fn an_unknown_codec_is_never_forced_to_transcode() {
    assert_eq!(copy().for_client_audio(None, Some("aac")), copy());
    assert_eq!(copy().for_client_audio(None, Some("")), copy());
}

#[test]
fn a_transcode_or_filter_request_is_never_second_guessed() {
    for mode in [AudioMode::Aac, AudioMode::AacStandard, AudioMode::AacNight] {
        assert_eq!(
            audio(mode).for_client_audio(Some("ac3"), Some("")),
            audio(mode)
        );
    }
}

#[test]
fn video_copy_becomes_h264_when_the_client_cannot_decode_the_codec() {
    // The HEVC-Main10-on-an-8-bit-decoder case, declared as "I decode H.264 only".
    assert_eq!(
        copy().for_client_video(Some("hevc"), None, Some("h264")),
        re_encoded()
    );
}

#[test]
fn video_stays_a_copy_when_the_declared_set_holds_the_codec() {
    assert_eq!(
        copy().for_client_video(Some("hevc"), None, Some("h264,hevc,av1")),
        copy()
    );
    assert_eq!(
        copy().for_client_video(Some("HEVC"), None, Some("h264, hevc")),
        copy()
    );
}

#[test]
fn a_client_that_declares_no_video_never_pays_for_a_transcode() {
    assert_eq!(copy().for_client_video(Some("hevc"), None, None), copy());
    assert_eq!(copy().for_client_video(Some("vp9"), None, None), copy());
    assert_eq!(
        copy().for_client_video(Some("h264"), Some(10), None),
        copy()
    );
}

#[test]
fn an_empty_video_set_transcodes_every_known_codec() {
    assert_eq!(
        copy().for_client_video(Some("h264"), None, Some("")),
        re_encoded()
    );
}

#[test]
fn an_unknown_video_codec_is_never_forced_to_transcode() {
    assert_eq!(copy().for_client_video(None, None, Some("h264")), copy());
    assert_eq!(copy().for_client_video(None, Some(10), Some("")), copy());
}

#[test]
fn an_h264_request_is_never_second_guessed() {
    let forced = re_encoded();
    assert_eq!(
        forced.for_client_video(Some("h264"), None, Some("h264")),
        forced
    );
    assert_eq!(forced.for_client_video(Some("hevc"), None, None), forced);
    assert_eq!(
        forced.for_client_video(Some("h264"), Some(10), Some("h264")),
        forced
    );
}

#[test]
fn ten_bit_h264_is_re_encoded_for_a_client_that_declared_h264_alone() {
    assert_eq!(
        copy().for_client_video(Some("h264"), Some(10), Some(AVPLAYER)),
        re_encoded()
    );
    assert_eq!(
        copy().for_client_video(Some("h264"), Some(12), Some(AVPLAYER)),
        re_encoded()
    );
}

#[test]
fn ten_bit_h264_stays_a_copy_for_a_client_that_declared_it_decodes_one() {
    assert_eq!(
        copy().for_client_video(Some("h264"), Some(10), Some("h264,h26410bit")),
        copy()
    );
    assert_eq!(
        copy().for_client_video(Some("H264"), Some(10), Some("h264, H26410bit")),
        copy()
    );
}

#[test]
fn eight_bit_h264_stays_a_copy_for_a_client_that_declared_only_h264() {
    assert_eq!(
        copy().for_client_video(Some("h264"), Some(8), Some(AVPLAYER)),
        copy()
    );
}

#[test]
fn a_depth_nothing_read_keeps_the_copy_the_codec_name_earned() {
    assert_eq!(
        copy().for_client_video(Some("h264"), None, Some(AVPLAYER)),
        copy()
    );
}

#[test]
fn the_deep_declaration_does_not_stand_in_for_plain_h264() {
    assert_eq!(
        copy().for_client_video(Some("h264"), Some(8), Some("h26410bit")),
        re_encoded()
    );
}

#[test]
fn ten_bit_hevc_is_still_matched_on_its_name_alone() {
    assert_eq!(
        copy().for_client_video(Some("hevc"), Some(10), Some("hevc")),
        copy()
    );
}

#[test]
fn the_two_axes_move_independently() {
    let both = copy()
        .for_client_audio(Some("dts"), Some("aac"))
        .for_client_video(Some("hevc"), None, Some("h264"));
    assert_eq!(both, StreamMode::new(VideoMode::H264, AudioMode::Aac));
    assert_eq!(both.token(), "h264-aac");
    assert_eq!(
        audio(AudioMode::AacNight).for_client_video(Some("hevc"), None, Some("h264")),
        StreamMode::new(VideoMode::H264, AudioMode::AacNight)
    );
    assert_eq!(
        re_encoded().for_client_audio(Some("dts"), Some("aac")),
        StreamMode::new(VideoMode::H264, AudioMode::Aac)
    );
}

#[test]
fn a_video_declaration_alone_never_moves_the_audio_axis() {
    assert_eq!(
        copy()
            .for_client_video(Some("hevc"), None, Some("h264"))
            .audio,
        AudioMode::Copy
    );
    assert_eq!(
        copy().for_client_audio(Some("dts"), Some("aac")).video,
        VideoMode::Copy
    );
}
