//! Map ffprobe's output onto our best-effort [`ProbeResult`]: stream selection,
//! codec normalization, bit-depth and HDR-variant heuristics.

use crate::model::{AudioStream, ColorInfo, HdrFormat, SubtitleTrack, VideoStream};

use super::ffprobe_output::{FfChapter, FfStream, FfprobeOutput};
use super::{Chapter, ProbeResult};

pub(super) fn build_result(raw: FfprobeOutput) -> ProbeResult {
    // Container order: the audio-relative index is exactly ffmpeg's `0:a:<n>`.
    let audio_tracks: Vec<AudioStream> = raw
        .streams
        .iter()
        .filter(|&s| s.codec_type.as_deref() == Some("audio"))
        .enumerate()
        .map(|(i, s)| build_audio(s, i as u32))
        .collect();
    let audio = audio_tracks.first().cloned();

    ProbeResult {
        duration_ms: raw.format.as_ref().and_then(|fmt| {
            fmt.duration
                .as_deref()
                .and_then(|d| d.parse::<f64>().ok())
                .map(|secs| (secs * 1000.0) as u64)
        }),
        // The cover-art test must stay inside the predicate, or a leading mjpeg
        // poster stream wins and nulls out the actual video.
        video: raw
            .streams
            .iter()
            .find(|&s| s.codec_type.as_deref() == Some("video") && !is_probably_cover_art(s))
            .map(build_video),
        audio,
        audio_tracks,
        subtitles: raw
            .streams
            .iter()
            .filter(|&s| s.codec_type.as_deref() == Some("subtitle"))
            .map(|s| SubtitleTrack {
                language: s.language(),
                codec: normalize_codec(s.codec_name.as_deref()),
            })
            .collect(),
        chapters: raw.chapters.iter().filter_map(build_chapter).collect(),
        unreadable: None,
    }
}

fn build_chapter(c: &FfChapter) -> Option<Chapter> {
    let start = c
        .start_time
        .as_deref()
        .and_then(|s| s.parse::<f64>().ok())?;
    let end = c.end_time.as_deref().and_then(|s| s.parse::<f64>().ok())?;
    if end <= start {
        return None;
    }
    Some(Chapter {
        start_ms: (start * 1000.0) as u64,
        end_ms: (end * 1000.0) as u64,
        title: c
            .tags
            .as_ref()
            .and_then(|t| t.title.clone())
            .filter(|t| !t.trim().is_empty()),
    })
}

fn is_probably_cover_art(stream: &FfStream) -> bool {
    matches!(stream.codec_name.as_deref(), Some("mjpeg") | Some("png"))
        && stream.width.unwrap_or(0) <= 1000
        && stream.height.unwrap_or(0) <= 1000
}

fn build_video(stream: &FfStream) -> VideoStream {
    let bit_depth = stream
        .bits_per_raw_sample
        .as_deref()
        .and_then(|s| s.parse::<u32>().ok())
        .or_else(|| pixel_format_bit_depth(stream.pix_fmt.as_deref()));

    let dovi = stream.dovi();
    let hdr_format = hdr_format(stream, bit_depth, dovi.is_some());
    let color = ColorInfo {
        primaries: stream.color_primaries.clone(),
        transfer: stream.color_transfer.clone(),
        matrix: stream.color_space.clone(),
    };

    VideoStream {
        codec: normalize_codec(stream.codec_name.as_deref()),
        width: stream.width,
        height: stream.height,
        hdr: hdr_format.is_some(),
        bit_depth,
        hdr_format,
        dolby_vision_profile: dovi.and_then(|d| d.dv_profile),
        color: (!color.is_empty()).then_some(color),
    }
}

fn build_audio(stream: &FfStream, index: u32) -> AudioStream {
    AudioStream {
        index,
        codec: normalize_codec(stream.codec_name.as_deref()),
        channels: stream.channels,
        language: stream.language(),
        title: stream.title(),
        default: stream
            .disposition
            .as_ref()
            .is_some_and(|d| d.default == Some(1)),
    }
}

// The DOVI record outranks the transfer function, because a Dolby Vision stream
// can signal any transfer or none at all. HDR10+ is absent on purpose: its
// metadata is per-frame SEI that a header read cannot see, so a file carrying it
// is recorded as the HDR10 it also is.
fn hdr_format(stream: &FfStream, bit_depth: Option<u32>, dolby_vision: bool) -> Option<HdrFormat> {
    if dolby_vision {
        return Some(HdrFormat::DolbyVision);
    }
    match stream.color_transfer.as_deref().unwrap_or("") {
        "smpte2084" => return Some(HdrFormat::Hdr10),
        "arib-std-b67" => return Some(HdrFormat::Hlg),
        _ => {}
    }
    let wide_gamut = matches!(stream.color_primaries.as_deref().unwrap_or(""), "bt2020");
    let deep = bit_depth.is_some_and(|b| b >= 10);
    (deep && wide_gamut).then_some(HdrFormat::Hdr10)
}

fn pixel_format_bit_depth(pix_fmt: Option<&str>) -> Option<u32> {
    let pix_fmt = pix_fmt?;
    if pix_fmt.contains("p10") || pix_fmt.contains("10le") || pix_fmt.contains("10be") {
        Some(10)
    } else if pix_fmt.contains("p12") || pix_fmt.contains("12le") || pix_fmt.contains("12be") {
        Some(12)
    } else if !pix_fmt.is_empty() {
        Some(8)
    } else {
        None
    }
}

/// The lowercase canonical form clients expect.
pub fn normalize_codec(name: Option<&str>) -> String {
    let raw = name.unwrap_or("unknown").to_ascii_lowercase();
    match raw.as_str() {
        "h265" | "hevc" => "hevc",
        "h264" | "avc" => "h264",
        "av01" | "av1" => "av1",
        "vp09" | "vp9" => "vp9",
        "vp08" | "vp8" => "vp8",
        "mpeg4" => "mpeg4",
        "eac3" | "e-ac-3" => "eac3",
        "ac3" | "ac-3" => "ac3",
        "dca" | "dts" => "dts",
        "truehd" => "truehd",
        "mp4a" | "aac" => "aac",
        "mp3" | "mp3float" => "mp3",
        "flac" => "flac",
        "opus" => "opus",
        "vorbis" => "vorbis",
        "subrip" | "srt" => "subrip",
        "ass" | "ssa" => "ass",
        "hdmv_pgs_subtitle" | "pgs" => "pgs",
        "mov_text" => "mov_text",
        // Hand back the owned, already-lowercased string rather than a copy.
        _ => return raw,
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn video_of(stream_json: &str) -> VideoStream {
        let raw: FfprobeOutput =
            serde_json::from_str(&format!(r#"{{"streams":[{stream_json}]}}"#)).unwrap();
        build_result(raw)
            .video
            .expect("the fixture describes one video stream")
    }

    #[test]
    fn a_dolby_vision_record_outranks_the_transfer_and_keeps_its_profile() {
        let video = video_of(
            r#"{"codec_type":"video","codec_name":"hevc","pix_fmt":"yuv420p10le",
                "color_transfer":"smpte2084","color_primaries":"bt2020","color_space":"bt2020nc",
                "side_data_list":[{"side_data_type":"DOVI configuration record","dv_profile":5}]}"#,
        );

        assert_eq!(video.hdr_format, Some(HdrFormat::DolbyVision));
        assert_eq!(video.dolby_vision_profile, Some(5));
        assert!(video.hdr);
    }

    #[test]
    fn pq_reads_as_hdr10_and_the_arib_transfer_as_hlg() {
        let pq =
            video_of(r#"{"codec_type":"video","codec_name":"hevc","color_transfer":"smpte2084"}"#);
        let hlg = video_of(
            r#"{"codec_type":"video","codec_name":"hevc","color_transfer":"arib-std-b67"}"#,
        );

        assert_eq!(pq.hdr_format, Some(HdrFormat::Hdr10));
        assert_eq!(hlg.hdr_format, Some(HdrFormat::Hlg));
        assert!(pq.dolby_vision_profile.is_none());
    }

    #[test]
    fn ten_bit_bt2020_with_no_transfer_stated_still_reads_as_hdr10() {
        let video = video_of(
            r#"{"codec_type":"video","codec_name":"hevc","pix_fmt":"yuv420p10le",
                "color_primaries":"bt2020"}"#,
        );

        assert_eq!(video.hdr_format, Some(HdrFormat::Hdr10));
        assert_eq!(video.bit_depth, Some(10));
    }

    #[test]
    fn an_sdr_stream_names_no_variant_and_its_colour_still_travels() {
        let video = video_of(
            r#"{"codec_type":"video","codec_name":"h264","pix_fmt":"yuv420p",
                "color_transfer":"bt709","color_primaries":"bt709","color_space":"bt709"}"#,
        );

        assert!(video.hdr_format.is_none());
        assert!(!video.hdr);
        let color = video
            .color
            .expect("bt709 is colour metadata like any other");
        assert_eq!(color.primaries.as_deref(), Some("bt709"));
        assert_eq!(color.transfer.as_deref(), Some("bt709"));
        assert_eq!(color.matrix.as_deref(), Some("bt709"));
    }

    #[test]
    fn a_stream_that_states_no_colour_at_all_carries_none() {
        let video = video_of(r#"{"codec_type":"video","codec_name":"h264"}"#);

        assert!(video.color.is_none());
        assert!(video.hdr_format.is_none());
    }
}
