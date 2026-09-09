//! Which of a title's media files is preferred, and the order the rest follow in.

use std::cmp::Ordering;

use super::MediaFile;

/// MEDIA-8's rank, best first: resolution, then HDR over SDR, then bit depth,
/// then audio channel count, then bitrate, with the file id settling a tie so the
/// order never depends on how the rows came back. Standing comes before all of
/// it, because a file's stream columns describe what it claims and not whether it
/// opens.
pub fn by_preference(a: &MediaFile, b: &MediaFile) -> Ordering {
    preference(b)
        .cmp(&preference(a))
        .then_with(|| a.id.cmp(&b.id))
}

// How far a file is from playable, which no stream column says. A file ffprobe
// refused is below one nothing has looked at yet: the first is known broken, the
// second is only undescribed.
fn standing(file: &MediaFile) -> u8 {
    match (file.unreadable.is_some(), file.probed) {
        (true, _) => 0,
        (false, false) => 1,
        (false, true) => 2,
    }
}

type Preference = (u8, u32, bool, u32, u32, u64);

fn preference(file: &MediaFile) -> Preference {
    let video = file.video.as_ref();
    (
        standing(file),
        video.and_then(|v| v.width).unwrap_or(0),
        video.is_some_and(|v| v.hdr),
        video.and_then(|v| v.bit_depth).unwrap_or(0),
        file.audio.as_ref().and_then(|a| a.channels).unwrap_or(0),
        bitrate_bps(file),
    )
}

fn bitrate_bps(file: &MediaFile) -> u64 {
    match (file.size, file.duration_ms) {
        (Some(size), Some(ms)) if ms > 0 => size.saturating_mul(8_000) / ms,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::super::{AudioStream, VideoStream};
    use super::*;

    fn file(id: &str) -> MediaFile {
        MediaFile {
            id: id.into(),
            rel_path: None,
            container: "mkv".into(),
            duration_ms: Some(7_200_000),
            video: Some(VideoStream {
                codec: "hevc".into(),
                width: Some(1920),
                height: Some(1080),
                hdr: false,
                bit_depth: Some(8),
                hdr_format: None,
                dolby_vision_profile: None,
                color: None,
            }),
            audio: Some(AudioStream {
                index: 0,
                codec: "eac3".into(),
                channels: Some(2),
                language: None,
                title: None,
                default: true,
            }),
            audio_tracks: Vec::new(),
            subtitles: Vec::new(),
            size: Some(1_000_000_000),
            edition: None,
            probed: true,
            unreadable: None,
            edition_id: None,
            abs_path: None,
        }
    }

    fn ranked(mut files: Vec<MediaFile>) -> Vec<String> {
        files.sort_by(by_preference);
        files.into_iter().map(|f| f.id).collect()
    }

    fn preferred(better: MediaFile, worse: MediaFile) -> String {
        let ids = ranked(vec![worse, better]);
        ids[0].clone()
    }

    #[test]
    fn resolution_outranks_everything_under_it() {
        let mut uhd = file("uhd");
        uhd.video.as_mut().unwrap().width = Some(3840);
        let mut hd = file("hd");
        hd.video.as_mut().unwrap().hdr = true;
        hd.video.as_mut().unwrap().bit_depth = Some(10);
        hd.audio.as_mut().unwrap().channels = Some(8);

        assert_eq!(preferred(uhd, hd), "uhd");
    }

    #[test]
    fn at_one_resolution_hdr_then_bit_depth_then_channels_then_bitrate_decide() {
        let mut hdr = file("hdr");
        hdr.video.as_mut().unwrap().hdr = true;
        assert_eq!(preferred(hdr, file("sdr")), "hdr");

        let mut ten_bit = file("ten-bit");
        ten_bit.video.as_mut().unwrap().bit_depth = Some(10);
        assert_eq!(preferred(ten_bit, file("eight-bit")), "ten-bit");

        let mut surround = file("surround");
        surround.audio.as_mut().unwrap().channels = Some(6);
        assert_eq!(preferred(surround, file("stereo")), "surround");

        let mut fat = file("fat");
        fat.size = Some(20_000_000_000);
        assert_eq!(preferred(fat, file("thin")), "fat");
    }

    #[test]
    fn a_file_that_will_not_open_sinks_below_one_nothing_has_probed_yet() {
        let mut broken = file("broken");
        broken.unreadable = Some("moov atom not found".into());
        broken.video.as_mut().unwrap().width = Some(3840);
        let mut unprobed = file("unprobed");
        unprobed.probed = false;
        unprobed.video = None;

        assert_eq!(
            ranked(vec![broken, unprobed, file("good")]),
            ["good", "unprobed", "broken"]
        );
    }

    #[test]
    fn two_files_that_compare_equal_order_by_id_rather_than_by_arrival() {
        assert_eq!(ranked(vec![file("b"), file("a")]), ["a", "b"]);
        assert_eq!(ranked(vec![file("a"), file("b")]), ["a", "b"]);
    }

    #[test]
    fn a_file_with_no_duration_is_ranked_without_guessing_a_bitrate() {
        let mut no_duration = file("no-duration");
        no_duration.duration_ms = None;

        assert_eq!(preferred(file("known"), no_duration), "known");
    }
}
