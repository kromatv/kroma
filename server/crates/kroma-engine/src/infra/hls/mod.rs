//! On-demand HLS delivery.
//!
//! Direct-play (raw byte range, [`crate::infra::stream`]) is the default; this
//! covers what a browser can't direct-play: MKV→fMP4 repackaging, audio it
//! can't decode (AC3/EAC3/DTS → AAC), video it can't decode (HEVC → H.264), and
//! language switching. A thin wrapper over a [`session`] registry: one
//! continuous ffmpeg per (item, mode, anchor) produces a complete-program HLS
//! master. The anchor is part of both the session key and the URL path, so a
//! re-anchor never reuses another anchor's segment names or thrashes a shared
//! session.

mod ffmpeg;
mod hwaccel;
mod naming;
mod reclaim;
mod session;

use std::path::Path;
use std::sync::Arc;

use session::Sessions;

/// The boxes a downscale fits the picture inside. A BOX rather than a height,
/// because a decoder's ceiling is two numbers and scope content hits the width
/// one first: 3840x1604 is under a 1920-tall limit and still four times too wide.
/// A closed set, because the box is part of the session key and every distinct
/// value is another ffmpeg and another copy of the segments on disk.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Rung {
    P1080,
    P720,
}

impl Rung {
    /// Width, height. The picture keeps its aspect and fits INSIDE this, so a
    /// scope frame comes out wider and shorter than the box.
    pub const fn box_size(self) -> (u32, u32) {
        match self {
            Self::P1080 => (1920, 1080),
            Self::P720 => (1280, 720),
        }
    }

    /// The largest rung that fits inside a decoder capped at `max`, or None when
    /// even the smallest does not (a device no downscale reaches).
    fn under(max: (u32, u32)) -> Option<Self> {
        [Self::P1080, Self::P720].into_iter().find(|r| {
            let (w, h) = r.box_size();
            w <= max.0 && h <= max.1
        })
    }

    const fn token(self) -> &'static str {
        match self {
            Self::P1080 => "h264-1080-",
            Self::P720 => "h264-720-",
        }
    }
}

/// One program's video treatment: stream-copy, a transcode to the 8-bit H.264
/// every target decodes, or that transcode scaled down to a rung the client's
/// decoder accepts. A picture is orders of magnitude dearer to re-encode than a
/// soundtrack, so [`StreamMode::for_client_video`] is the only thing that ever
/// reaches past `Copy`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum VideoMode {
    Copy,
    H264,
    H264At(Rung),
}

impl VideoMode {
    /// The box the picture is fitted inside, or None where it keeps its own size.
    pub const fn box_size(self) -> Option<(u32, u32)> {
        match self {
            Self::H264At(rung) => Some(rung.box_size()),
            Self::Copy | Self::H264 => None,
        }
    }

    const fn token(self) -> &'static str {
        match self {
            Self::Copy => "",
            Self::H264 => H264_PREFIX,
            Self::H264At(rung) => rung.token(),
        }
    }
}

/// One program's audio treatment: stream-copy, plain stereo-AAC transcode, or an
/// AAC transcode with a loudness filter (night-mode volume leveling for clients
/// with no local audio DSP, e.g. Tizen AVPlay). A filter always transcodes - a
/// stream copy cannot be filtered - so the filtered variants subsume `Aac`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AudioMode {
    Copy,
    Aac,
    AacStandard,
    AacNight,
}

/// How one program is produced, on both axes. They are independent: a device can
/// decode the picture and not the soundtrack, or the reverse.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct StreamMode {
    pub video: VideoMode,
    pub audio: AudioMode,
}

// The video axis is spelled as a prefix on the audio token, so every URL minted
// before the axis existed still parses - and still means a video stream copy.
const H264_PREFIX: &str = "h264-";

impl StreamMode {
    pub const fn new(video: VideoMode, audio: AudioMode) -> Self {
        StreamMode { video, audio }
    }

    /// Parse the `{mode}` URL path segment (also the token used in session keys).
    pub fn parse(s: &str) -> Option<Self> {
        // Longest prefix first: `h264-1080-` also starts with `h264-`.
        let (video, rest) = if let Some(rest) = s.strip_prefix(Rung::P1080.token()) {
            (VideoMode::H264At(Rung::P1080), rest)
        } else if let Some(rest) = s.strip_prefix(Rung::P720.token()) {
            (VideoMode::H264At(Rung::P720), rest)
        } else if let Some(rest) = s.strip_prefix(H264_PREFIX) {
            (VideoMode::H264, rest)
        } else {
            (VideoMode::Copy, s)
        };
        let audio = match rest {
            "copy" => AudioMode::Copy,
            "aac" => AudioMode::Aac,
            "aac-standard" => AudioMode::AacStandard,
            "aac-night" => AudioMode::AacNight,
            _ => return None,
        };
        Some(Self::new(video, audio))
    }

    /// The mode whose audio will actually reach the speakers, given the selected
    /// track's codec and the comma-separated set the client declared it can decode
    /// (`None` = declared nothing, and the request stands). Only an audio copy is
    /// ever overridden, and only the audio axis moves.
    pub fn for_client_audio(self, codec: Option<&str>, client_decodes: Option<&str>) -> Self {
        match (self.audio, client_decodes) {
            (AudioMode::Copy, Some(set)) if !client_can_play(codec, set) => Self {
                audio: AudioMode::Aac,
                ..self
            },
            _ => self,
        }
    }

    /// The mode whose picture will actually reach the screen, read the same way as
    /// [`Self::for_client_audio`] from the source video codec and the set the
    /// client declared: the real case is HEVC Main10 on an 8-bit-only decoder,
    /// which otherwise plays black. Only a video copy is overridden, and never
    /// speculatively - a client that declares nothing keeps its stream copy.
    pub fn for_client_video(self, codec: Option<&str>, client_decodes: Option<&str>) -> Self {
        match (self.video, client_decodes) {
            (VideoMode::Copy, Some(set)) if !client_can_play(codec, set) => Self {
                video: VideoMode::H264,
                ..self
            },
            _ => self,
        }
    }

    /// The mode whose picture actually fits the decoder it is going to. A decoder
    /// has a size ceiling as surely as it has a codec list, and no player works
    /// around one: a frame over it either refuses to open or falls to a software
    /// decoder that cannot keep up. `source` is the file's own size and `max`
    /// what the client declared; either absent leaves the mode alone.
    ///
    /// Both axes count. Overrides a copy AND a full-size re-encode, because a
    /// re-encode at the source's size is just as unplayable as the source.
    pub fn for_client_frame(self, source: Option<(u32, u32)>, max: Option<(u32, u32)>) -> Self {
        let (Some(source), Some(max)) = (source, max) else {
            return self;
        };
        if source.0 <= max.0 && source.1 <= max.1 {
            return self;
        }
        Rung::under(max).map_or(self, |rung| Self {
            video: VideoMode::H264At(rung),
            ..self
        })
    }

    // Inverse of `parse`; emitted by the client URL builder in `packages/client media.ts`.
    pub fn token(self) -> String {
        format!("{}{}", self.video.token(), self.audio.token())
    }
}

impl AudioMode {
    const fn token(self) -> &'static str {
        match self {
            Self::Copy => "copy",
            Self::Aac => "aac",
            Self::AacStandard => "aac-standard",
            Self::AacNight => "aac-night",
        }
    }

    fn transcode(self) -> bool {
        !matches!(self, Self::Copy)
    }

    // Tuned to match the client Web Audio compressor (packages/ui
    // `audio-filter.ts`) so every engine sounds the same.
    fn filter_chain(self) -> Option<&'static str> {
        match self {
            Self::Copy | Self::Aac => None,
            Self::AacStandard => {
                Some("acompressor=threshold=0.063:ratio=4:attack=10:release=250:knee=6:makeup=1.4")
            }
            Self::AacNight => {
                Some("acompressor=threshold=0.04:ratio=8:attack=4:release=250:knee=5,volume=0.9")
            }
        }
    }
}

// An unprobed stream is assumed playable: with no codec there is nothing honest
// to override, and forcing a transcode would punish the common case.
fn client_can_play(codec: Option<&str>, client_set: &str) -> bool {
    let Some(codec) = codec else { return true };
    client_set
        .split(',')
        .any(|c| c.trim().eq_ignore_ascii_case(codec))
}

// `{item_id}:{mode}:{anchor_secs}:a{audio}`. The mode is part of the key
// because filtered, transcoded and clean programs must never share segment URLs
// (segments are cached immutably per URL).
fn session_key(item_id: &str, mode: StreamMode, anchor: u64, audio: u32) -> String {
    format!("{item_id}:{}:{anchor}:a{audio}", mode.token())
}

// The `(item_id, a{audio})` a key identifies, apart from mode and anchor.
// Split from the right because an item id may itself contain a colon.
fn program_of(key: &str) -> Option<(&str, &str)> {
    let (head, audio) = key.rsplit_once(':')?;
    let (head, _anchor) = head.rsplit_once(':')?;
    let (item, _mode) = head.rsplit_once(':')?;
    Some((item, audio))
}

// Whether two session keys play the same program and differ only in mode /
// anchor - used by the session registry to pick a victim under the
// concurrency cap (see `Sessions::make_room`).
fn same_program(a: &str, b: &str) -> bool {
    match (program_of(a), program_of(b)) {
        (Some(x), Some(y)) => x == y,
        _ => false,
    }
}

pub struct HlsEngine {
    sessions: Arc<Sessions>,
    durations: std::sync::Mutex<std::collections::HashMap<String, Option<u64>>>,
}

impl HlsEngine {
    /// `max_concurrent` hard-caps live sessions; `cache_budget` is the on-disk
    /// byte budget that trims idle / superseded sessions (0 = unlimited).
    pub fn new(data_dir: &Path, max_concurrent: usize, cache_budget: u64) -> Self {
        HlsEngine {
            sessions: Arc::new(Sessions::new(data_dir, max_concurrent, cache_budget)),
            durations: std::sync::Mutex::new(std::collections::HashMap::new()),
        }
    }

    /// True media duration (ms) of the input file, ffprobed once (duration-only,
    /// header read) and cached. Lets the player show the real length when the
    /// catalog row was never probed - otherwise the growing EVENT playlist's
    /// duration is all the client can see (it reads the live edge as the total).
    pub async fn input_duration_ms(&self, input: &str) -> Option<u64> {
        if let Some(v) = self.durations.lock().unwrap().get(input).copied() {
            return v;
        }
        let path = input.to_string();
        let dur = tokio::task::spawn_blocking(move || {
            crate::infra::probe::probe_duration_ms(Path::new(&path))
        })
        .await
        .ok()
        .flatten();
        self.durations
            .lock()
            .unwrap()
            .insert(input.to_string(), dur);
        dur
    }

    pub fn spawn_reaper(&self) {
        self.sessions.spawn_reaper();
    }

    pub fn cache_bytes(&self) -> u64 {
        self.sessions.bytes()
    }

    /// Retune the on-disk cache byte budget at runtime (0 = unlimited).
    pub fn set_cache_budget(&self, bytes: u64) {
        self.sessions.set_budget(bytes);
    }

    /// The media playlist for `item_id` in `mode`, anchored at `anchor` seconds
    /// (input `-ss`, 0 = start), muxing the `audio`-th audio track. Returns the
    /// playlist text + the REAL stream start (s) - the keyframe at-or-before
    /// `anchor` - for the client's `baseSec`.
    pub async fn master(
        &self,
        item_id: &str,
        input: &str,
        audio: u32,
        mode: StreamMode,
        anchor: u64,
    ) -> Option<(String, f64)> {
        let key = session_key(item_id, mode, anchor, audio);
        let (bytes, start) = self
            .sessions
            .master(&key, Path::new(input), audio, mode, anchor as f64)
            .await?;
        Some((String::from_utf8(bytes).ok()?, start))
    }

    /// A child file (init or segment) of the `(mode, anchor, audio)` session.
    pub async fn file(
        &self,
        item_id: &str,
        mode: StreamMode,
        anchor: u64,
        audio: u32,
        name: &str,
    ) -> Option<(Vec<u8>, &'static str)> {
        let key = session_key(item_id, mode, anchor, audio);
        self.sessions.file(&key, name).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VIDEO_MODES: [VideoMode; 4] = [
        VideoMode::Copy,
        VideoMode::H264,
        VideoMode::H264At(Rung::P1080),
        VideoMode::H264At(Rung::P720),
    ];
    const AUDIO_MODES: [AudioMode; 4] = [
        AudioMode::Copy,
        AudioMode::Aac,
        AudioMode::AacStandard,
        AudioMode::AacNight,
    ];

    const fn copy() -> StreamMode {
        StreamMode::new(VideoMode::Copy, AudioMode::Copy)
    }

    const fn audio(audio: AudioMode) -> StreamMode {
        StreamMode::new(VideoMode::Copy, audio)
    }

    // The Chromecast HD's own ceiling, which is square because its decoders
    // declare one size limit for both axes.
    const CHROMECAST_HD: (u32, u32) = (1920, 1920);

    #[test]
    fn scales_a_source_larger_than_the_decoder_the_client_declared() {
        let copy = StreamMode::new(VideoMode::Copy, AudioMode::Copy);

        let scaled = copy.for_client_frame(Some((3840, 2160)), Some(CHROMECAST_HD));

        assert_eq!(scaled.video, VideoMode::H264At(Rung::P1080));
        assert_eq!(scaled.audio, AudioMode::Copy);
        assert_eq!(scaled.token(), "h264-1080-copy");
    }

    #[test]
    fn scales_a_scope_frame_that_is_only_too_wide() {
        let copy = StreamMode::new(VideoMode::Copy, AudioMode::Copy);

        // 1604 rows clears a 1920 ceiling; 3840 columns do not.
        let scaled = copy.for_client_frame(Some((3840, 1604)), Some(CHROMECAST_HD));

        assert_eq!(scaled.video, VideoMode::H264At(Rung::P1080));
    }

    #[test]
    fn leaves_a_picture_the_client_can_already_take() {
        let copy = StreamMode::new(VideoMode::Copy, AudioMode::Copy);

        assert_eq!(
            copy.for_client_frame(Some((1920, 1080)), Some(CHROMECAST_HD)),
            copy
        );
        assert_eq!(copy.for_client_frame(Some((3840, 2160)), None), copy);
        assert_eq!(copy.for_client_frame(None, Some(CHROMECAST_HD)), copy);
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
        let copy = StreamMode::new(VideoMode::Copy, AudioMode::Copy);

        assert_eq!(
            copy.for_client_frame(Some((3840, 2160)), Some((1280, 800))).video,
            VideoMode::H264At(Rung::P720)
        );
        assert_eq!(
            copy.for_client_frame(Some((3840, 2160)), Some((640, 480))).video,
            VideoMode::Copy
        );
    }

    #[test]
    fn mode_tokens_round_trip() {
        for video in VIDEO_MODES {
            for audio in AUDIO_MODES {
                let mode = StreamMode::new(video, audio);
                assert_eq!(StreamMode::parse(&mode.token()), Some(mode));
            }
        }
        assert_eq!(StreamMode::parse("bogus"), None);
        assert_eq!(StreamMode::parse("h264-"), None);
        assert_eq!(StreamMode::parse("h264-bogus"), None);
    }

    #[test]
    fn a_token_with_no_video_prefix_still_means_a_video_copy() {
        for (token, audio) in [
            ("copy", AudioMode::Copy),
            ("aac", AudioMode::Aac),
            ("aac-standard", AudioMode::AacStandard),
            ("aac-night", AudioMode::AacNight),
        ] {
            assert_eq!(
                StreamMode::parse(token),
                Some(StreamMode::new(VideoMode::Copy, audio))
            );
        }
    }

    #[test]
    fn the_video_axis_is_a_prefix_on_the_audio_token() {
        assert_eq!(
            StreamMode::new(VideoMode::H264, AudioMode::Copy).token(),
            "h264-copy"
        );
        assert_eq!(
            StreamMode::new(VideoMode::H264, AudioMode::AacNight).token(),
            "h264-aac-night"
        );
    }

    #[test]
    fn filtered_modes_transcode_with_a_chain() {
        assert!(!AudioMode::Copy.transcode());
        assert!(AudioMode::Aac.transcode());
        assert!(AudioMode::Aac.filter_chain().is_none());
        assert!(AudioMode::AacStandard.transcode());
        assert!(AudioMode::AacStandard
            .filter_chain()
            .unwrap()
            .contains("ratio=4"));
        assert!(AudioMode::AacNight
            .filter_chain()
            .unwrap()
            .contains("ratio=8"));
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
            copy().for_client_video(Some("hevc"), Some("h264")),
            StreamMode::new(VideoMode::H264, AudioMode::Copy)
        );
    }

    #[test]
    fn video_stays_a_copy_when_the_declared_set_holds_the_codec() {
        assert_eq!(
            copy().for_client_video(Some("hevc"), Some("h264,hevc,av1")),
            copy()
        );
        assert_eq!(
            copy().for_client_video(Some("HEVC"), Some("h264, hevc")),
            copy()
        );
    }

    #[test]
    fn a_client_that_declares_no_video_never_pays_for_a_transcode() {
        assert_eq!(copy().for_client_video(Some("hevc"), None), copy());
        assert_eq!(copy().for_client_video(Some("vp9"), None), copy());
    }

    #[test]
    fn an_empty_video_set_transcodes_every_known_codec() {
        assert_eq!(
            copy().for_client_video(Some("h264"), Some("")),
            StreamMode::new(VideoMode::H264, AudioMode::Copy)
        );
    }

    #[test]
    fn an_unknown_video_codec_is_never_forced_to_transcode() {
        assert_eq!(copy().for_client_video(None, Some("h264")), copy());
        assert_eq!(copy().for_client_video(None, Some("")), copy());
    }

    #[test]
    fn an_h264_request_is_never_second_guessed() {
        let forced = StreamMode::new(VideoMode::H264, AudioMode::Copy);
        assert_eq!(forced.for_client_video(Some("h264"), Some("h264")), forced);
        assert_eq!(forced.for_client_video(Some("hevc"), None), forced);
    }

    #[test]
    fn the_two_axes_move_independently() {
        let both = copy()
            .for_client_audio(Some("dts"), Some("aac"))
            .for_client_video(Some("hevc"), Some("h264"));
        assert_eq!(both, StreamMode::new(VideoMode::H264, AudioMode::Aac));
        assert_eq!(both.token(), "h264-aac");
        assert_eq!(
            audio(AudioMode::AacNight).for_client_video(Some("hevc"), Some("h264")),
            StreamMode::new(VideoMode::H264, AudioMode::AacNight)
        );
        assert_eq!(
            StreamMode::new(VideoMode::H264, AudioMode::Copy)
                .for_client_audio(Some("dts"), Some("aac")),
            StreamMode::new(VideoMode::H264, AudioMode::Aac)
        );
    }

    #[test]
    fn a_video_declaration_alone_never_moves_the_audio_axis() {
        assert_eq!(
            copy().for_client_video(Some("hevc"), Some("h264")).audio,
            AudioMode::Copy
        );
        assert_eq!(
            copy().for_client_audio(Some("dts"), Some("aac")).video,
            VideoMode::Copy
        );
    }

    #[test]
    fn session_keys_keep_filtered_programs_apart() {
        let clean = session_key("it1", audio(AudioMode::Aac), 30, 1);
        let night = session_key("it1", audio(AudioMode::AacNight), 30, 1);
        assert_eq!(clean, "it1:aac:30:a1");
        assert_eq!(night, "it1:aac-night:30:a1");
        assert_ne!(clean, night);
    }

    #[test]
    fn session_keys_keep_a_transcoded_picture_apart_from_a_copied_one() {
        let copied = session_key("it1", audio(AudioMode::Aac), 30, 1);
        let recoded = session_key(
            "it1",
            StreamMode::new(VideoMode::H264, AudioMode::Aac),
            30,
            1,
        );
        assert_eq!(recoded, "it1:h264-aac:30:a1");
        assert_ne!(copied, recoded);
    }

    #[test]
    fn same_program_spans_anchors_and_modes_only() {
        let key = session_key("it1", audio(AudioMode::Aac), 30, 1);
        assert!(same_program(
            &key,
            &session_key("it1", audio(AudioMode::Aac), 900, 1)
        ));
        assert!(same_program(
            &key,
            &session_key("it1", audio(AudioMode::AacNight), 30, 1)
        ));
        assert!(same_program(
            &key,
            &session_key(
                "it1",
                StreamMode::new(VideoMode::H264, AudioMode::Aac),
                30,
                1
            )
        ));
        assert!(!same_program(
            &key,
            &session_key("it1", audio(AudioMode::Aac), 30, 2)
        ));
        assert!(!same_program(
            &key,
            &session_key("it2", audio(AudioMode::Aac), 30, 1)
        ));
        assert!(!same_program(&key, "nonsense"));
        assert!(!same_program("nonsense", "nonsense"));
    }

    #[test]
    fn program_of_tolerates_a_colon_in_the_item_id() {
        assert_eq!(
            program_of("tv:s1e2:aac-night:30:a1"),
            Some(("tv:s1e2", "a1"))
        );
        assert_eq!(program_of("it1:copy:0:a0"), Some(("it1", "a0")));
        assert_eq!(program_of("bogus"), None);
    }
}
