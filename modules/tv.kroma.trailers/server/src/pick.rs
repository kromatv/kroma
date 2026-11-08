use crate::innertube::Format;

fn downloadable(format: &Format) -> bool {
    format.url.is_some() && format.size().is_some_and(|size| size > 0)
}

pub(crate) fn video(formats: &[Format], max_height: u32) -> Option<&Format> {
    formats
        .iter()
        .filter(|f| f.mime_type.starts_with("video/mp4") && f.mime_type.contains("avc1"))
        .filter(|f| f.height.is_some_and(|h| h <= max_height))
        .filter(|f| downloadable(f))
        .max_by_key(|f| (f.height.unwrap_or(0), f.bitrate))
}

fn original(format: &Format) -> bool {
    match &format.audio_track {
        None => true,
        Some(track) => {
            track.audio_is_default
                && !track.is_auto_dubbed
                && !track
                    .display_name
                    .to_ascii_lowercase()
                    .contains("descriptive")
        }
    }
}

pub(crate) fn audio(formats: &[Format]) -> Option<&Format> {
    let aac = || {
        formats
            .iter()
            .filter(|f| f.mime_type.starts_with("audio/mp4") && f.mime_type.contains("mp4a"))
            .filter(|f| downloadable(f) && !f.is_drc)
    };
    let low_complexity = |f: &&Format| f.mime_type.contains("mp4a.40.2");
    aac()
        .filter(|f| original(f))
        .max_by_key(|f| (low_complexity(f), f.bitrate))
        .or_else(|| {
            aac()
                .filter(|f| f.audio_track.as_ref().is_none_or(|t| !t.is_auto_dubbed))
                .max_by_key(|f| (low_complexity(f), f.bitrate))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::innertube::AudioTrack;

    fn format(itag: u32, mime: &str, height: Option<u32>, bitrate: u64) -> Format {
        Format {
            itag,
            mime_type: mime.to_string(),
            url: Some(format!(
                "https://rr1---sn-x.googlevideo.com/videoplayback?itag={itag}"
            )),
            content_length: Some("1000".into()),
            height,
            bitrate,
            ..Format::default()
        }
    }

    fn dubbed(mut format: Format, id: &str, default: bool, auto: bool) -> Format {
        format.audio_track = Some(AudioTrack {
            id: id.to_string(),
            display_name: id.to_string(),
            audio_is_default: default,
            is_auto_dubbed: auto,
        });
        format
    }

    #[test]
    fn the_tallest_h264_picture_under_the_ceiling_wins() {
        let formats = [
            format(
                137,
                "video/mp4; codecs=\"avc1.640028\"",
                Some(1080),
                4_000_000,
            ),
            format(
                136,
                "video/mp4; codecs=\"avc1.64001F\"",
                Some(720),
                2_000_000,
            ),
            format(248, "video/webm; codecs=\"vp9\"", Some(1080), 3_000_000),
            format(
                399,
                "video/mp4; codecs=\"av01.0.08M.08\"",
                Some(1080),
                1_000_000,
            ),
        ];

        let picked = video(&formats, 1080).map(|f| f.itag);

        assert_eq!(picked, Some(137));
    }

    #[test]
    fn a_lower_ceiling_takes_a_smaller_picture() {
        let formats = [
            format(
                137,
                "video/mp4; codecs=\"avc1.640028\"",
                Some(1080),
                4_000_000,
            ),
            format(
                136,
                "video/mp4; codecs=\"avc1.64001F\"",
                Some(720),
                2_000_000,
            ),
        ];

        let picked = video(&formats, 720).map(|f| f.itag);

        assert_eq!(picked, Some(136));
    }

    #[test]
    fn a_format_behind_a_cipher_is_never_picked() {
        let mut ciphered = format(
            137,
            "video/mp4; codecs=\"avc1.640028\"",
            Some(1080),
            4_000_000,
        );
        ciphered.url = None;

        let formats = [ciphered];

        let picked = video(&formats, 1080);

        assert!(picked.is_none());
    }

    #[test]
    fn the_uploaders_own_track_beats_every_ai_dub() {
        let formats = [
            dubbed(
                format(140, "audio/mp4; codecs=\"mp4a.40.2\"", None, 130_000),
                "fr-FR.10",
                false,
                true,
            ),
            dubbed(
                format(140, "audio/mp4; codecs=\"mp4a.40.2\"", None, 129_000),
                "en-US.4",
                true,
                false,
            ),
            dubbed(
                format(139, "audio/mp4; codecs=\"mp4a.40.5\"", None, 48_000),
                "en-US.4",
                true,
                false,
            ),
        ];

        let picked = audio(&formats)
            .and_then(|f| f.audio_track.as_ref())
            .map(|t| t.id.as_str());

        assert_eq!(picked, Some("en-US.4"));
    }

    #[test]
    fn aac_lc_beats_he_aac() {
        let formats = [
            format(139, "audio/mp4; codecs=\"mp4a.40.5\"", None, 48_000),
            format(140, "audio/mp4; codecs=\"mp4a.40.2\"", None, 130_000),
        ];

        let picked = audio(&formats).map(|f| f.itag);

        assert_eq!(picked, Some(140));
    }

    #[test]
    fn an_auto_dub_is_never_the_fallback() {
        let formats = [dubbed(
            format(140, "audio/mp4; codecs=\"mp4a.40.2\"", None, 130_000),
            "fr-FR.10",
            false,
            true,
        )];

        let picked = audio(&formats);

        assert!(picked.is_none());
    }
}
