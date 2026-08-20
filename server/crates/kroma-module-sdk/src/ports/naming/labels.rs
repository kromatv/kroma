//! The stream-fact label vocabulary: turn a parsed release and a file's tracks
//! into the spellings a naming template renders (`1080p`, `x265`, `DTS-HD MA`).

/// Resolution, codec and source in the spellings Sonarr/Radarr use (`1080p`,
/// `x265`, `Bluray`).
pub fn quality_from_parsed(
    parsed: &crate::scene::ParsedRelease,
) -> (Option<String>, Option<String>, Option<String>) {
    use crate::scene::{Codec, Res, Source};
    let res = parsed.resolution.map(|r| match r {
        Res::R720 => "720p",
        Res::R1080 => "1080p",
        Res::R2160 => "2160p",
    });
    let codec = parsed.codec.map(|c| match c {
        Codec::Hevc => "x265",
        Codec::H264 => "x264",
        Codec::Av1 => "AV1",
        Codec::Xvid => "Xvid",
    });
    let source = parsed.source.map(|s| match s {
        Source::Remux => "Remux",
        Source::BluRay => "Bluray",
        Source::WebDl => "WEBDL",
        Source::WebRip => "WEBRip",
        Source::Hdtv => "HDTV",
        Source::Cam => "Cam",
    });
    (res.map(str::to_string), codec.map(str::to_string), source.map(str::to_string))
}

pub fn resolution_from_width(width: Option<i64>) -> Option<String> {
    match width? {
        w if w >= 3400 => Some("2160p".into()),
        w if w >= 1700 => Some("1080p".into()),
        w if w >= 1200 => Some("720p".into()),
        w if w >= 640 => Some("480p".into()),
        _ => None,
    }
}

pub fn codec_label(codec: Option<&str>) -> Option<String> {
    match codec?.to_ascii_lowercase().as_str() {
        "hevc" | "h265" | "x265" => Some("x265".into()),
        "h264" | "avc" | "x264" => Some("x264".into()),
        "av1" => Some("AV1".into()),
        other => Some(other.to_string()),
    }
}

/// Channel count to layout label, Radarr-style: `6` -> `5.1`.
pub fn audio_channels_label(channels: Option<u32>) -> Option<String> {
    Some(
        match channels? {
            0 => return None,
            1 => "1.0",
            2 => "2.0",
            3 => "2.1",
            6 => "5.1",
            7 => "6.1",
            8 => "7.1",
            n => return Some(format!("{n}.0")),
        }
        .to_string(),
    )
}

/// Audio codec label in the spelling scene groups use: `eac3` -> `EAC3`.
pub fn audio_codec_label(codec: Option<&str>) -> Option<String> {
    let c = codec?.to_ascii_lowercase();
    if c.is_empty() {
        return None;
    }
    Some(
        match c.as_str() {
            "aac" => "AAC",
            "ac3" | "ac-3" => "AC3",
            "eac3" | "e-ac-3" => "EAC3",
            "dts" => "DTS",
            "truehd" => "TrueHD",
            "flac" => "FLAC",
            "opus" => "Opus",
            "mp3" => "MP3",
            "vorbis" => "Vorbis",
            other => return Some(other.to_uppercase()),
        }
        .to_string(),
    )
}

/// `HDR` / `DV` label, or `None` for SDR.
pub fn dynamic_range(hdr: bool, dolby_vision: bool) -> Option<String> {
    if dolby_vision {
        Some("DV".into())
    } else if hdr {
        Some("HDR".into())
    } else {
        None
    }
}

/// Normalize a stream language tag to a 2-letter upper code (`eng` -> `EN`);
/// `None` for undefined/unknown, so it drops out of the `[EN+FR]` tag.
pub fn lang_code(lang: &str) -> Option<String> {
    let l = lang.trim().to_ascii_lowercase();
    if l.is_empty() || l == "und" || l == "unknown" || l == "mis" || l == "zxx" {
        return None;
    }
    Some(
        match l.as_str() {
            "eng" | "en" => "EN",
            "fre" | "fra" | "fr" => "FR",
            "ger" | "deu" | "de" => "DE",
            "spa" | "es" => "ES",
            "ita" | "it" => "IT",
            "jpn" | "ja" => "JA",
            "por" | "pt" => "PT",
            "rus" | "ru" => "RU",
            "chi" | "zho" | "zh" => "ZH",
            "kor" | "ko" => "KO",
            "nld" | "dut" | "nl" => "NL",
            other => return Some(other.get(..2).unwrap_or(other).to_uppercase()),
        }
        .to_string(),
    )
}

/// Deduped and order-preserving.
pub fn lang_list<'a>(raw: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for tag in raw {
        if let Some(code) = lang_code(tag) {
            if !out.contains(&code) {
                out.push(code);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolution_from_width_buckets() {
        assert_eq!(resolution_from_width(None), None);
        assert_eq!(resolution_from_width(Some(0)), None);
        assert_eq!(resolution_from_width(Some(639)), None);
        assert_eq!(resolution_from_width(Some(-10)), None);
        assert_eq!(resolution_from_width(Some(640)).as_deref(), Some("480p"));
        assert_eq!(resolution_from_width(Some(1199)).as_deref(), Some("480p"));
        assert_eq!(resolution_from_width(Some(1200)).as_deref(), Some("720p"));
        assert_eq!(resolution_from_width(Some(1699)).as_deref(), Some("720p"));
        assert_eq!(resolution_from_width(Some(1700)).as_deref(), Some("1080p"));
        assert_eq!(resolution_from_width(Some(3399)).as_deref(), Some("1080p"));
        assert_eq!(resolution_from_width(Some(3400)).as_deref(), Some("2160p"));
        assert_eq!(resolution_from_width(Some(7680)).as_deref(), Some("2160p"));
    }

    #[test]
    fn codec_label_maps_known_and_passes_through() {
        assert_eq!(codec_label(Some("HEVC")).as_deref(), Some("x265"));
        assert_eq!(codec_label(Some("h265")).as_deref(), Some("x265"));
        assert_eq!(codec_label(Some("x265")).as_deref(), Some("x265"));
        assert_eq!(codec_label(Some("AVC")).as_deref(), Some("x264"));
        assert_eq!(codec_label(Some("h264")).as_deref(), Some("x264"));
        assert_eq!(codec_label(Some("x264")).as_deref(), Some("x264"));
        assert_eq!(codec_label(Some("AV1")).as_deref(), Some("AV1"));
        assert_eq!(codec_label(Some("VP9")).as_deref(), Some("vp9"));
        assert_eq!(codec_label(None), None);
    }

    #[test]
    fn audio_channels_label_layouts() {
        assert_eq!(audio_channels_label(None), None);
        assert_eq!(audio_channels_label(Some(0)), None);
        assert_eq!(audio_channels_label(Some(1)).as_deref(), Some("1.0"));
        assert_eq!(audio_channels_label(Some(2)).as_deref(), Some("2.0"));
        assert_eq!(audio_channels_label(Some(3)).as_deref(), Some("2.1"));
        assert_eq!(audio_channels_label(Some(6)).as_deref(), Some("5.1"));
        assert_eq!(audio_channels_label(Some(7)).as_deref(), Some("6.1"));
        assert_eq!(audio_channels_label(Some(8)).as_deref(), Some("7.1"));
        assert_eq!(audio_channels_label(Some(4)).as_deref(), Some("4.0"));
        assert_eq!(audio_channels_label(Some(5)).as_deref(), Some("5.0"));
    }

    #[test]
    fn audio_codec_label_maps_and_uppercases() {
        assert_eq!(audio_codec_label(Some("aac")).as_deref(), Some("AAC"));
        assert_eq!(audio_codec_label(Some("AC-3")).as_deref(), Some("AC3"));
        assert_eq!(audio_codec_label(Some("ac3")).as_deref(), Some("AC3"));
        assert_eq!(audio_codec_label(Some("e-ac-3")).as_deref(), Some("EAC3"));
        assert_eq!(audio_codec_label(Some("eac3")).as_deref(), Some("EAC3"));
        assert_eq!(audio_codec_label(Some("dts")).as_deref(), Some("DTS"));
        assert_eq!(audio_codec_label(Some("TrueHD")).as_deref(), Some("TrueHD"));
        assert_eq!(audio_codec_label(Some("flac")).as_deref(), Some("FLAC"));
        assert_eq!(audio_codec_label(Some("opus")).as_deref(), Some("Opus"));
        assert_eq!(audio_codec_label(Some("mp3")).as_deref(), Some("MP3"));
        assert_eq!(audio_codec_label(Some("vorbis")).as_deref(), Some("Vorbis"));
        assert_eq!(audio_codec_label(Some("wma")).as_deref(), Some("WMA"));
        assert_eq!(audio_codec_label(Some("")), None);
        assert_eq!(audio_codec_label(None), None);
    }

    #[test]
    fn dynamic_range_priority() {
        assert_eq!(dynamic_range(false, false), None);
        assert_eq!(dynamic_range(true, false).as_deref(), Some("HDR"));
        assert_eq!(dynamic_range(false, true).as_deref(), Some("DV"));
        assert_eq!(dynamic_range(true, true).as_deref(), Some("DV"));
    }

    #[test]
    fn lang_code_normalizes_and_rejects() {
        assert_eq!(lang_code("eng").as_deref(), Some("EN"));
        assert_eq!(lang_code("EN").as_deref(), Some("EN"));
        assert_eq!(lang_code("  fra  ").as_deref(), Some("FR"));
        assert_eq!(lang_code("deu").as_deref(), Some("DE"));
        assert_eq!(lang_code("jpn").as_deref(), Some("JA"));
        assert_eq!(lang_code("zho").as_deref(), Some("ZH"));
        assert_eq!(lang_code("nld").as_deref(), Some("NL"));
        assert_eq!(lang_code("swe").as_deref(), Some("SW"));
        // A single-char tag has no 2-byte slice: falls back to the whole word.
        assert_eq!(lang_code("x").as_deref(), Some("X"));
        for junk in ["", "und", "unknown", "mis", "zxx", "  "] {
            assert_eq!(lang_code(junk), None, "{junk:?} should be rejected");
        }
    }

    #[test]
    fn lang_list_dedupes_in_order() {
        let out = lang_list(["eng", "en", "fre", "und", "xx", "fre"]);
        assert_eq!(out, vec!["EN".to_string(), "FR".to_string(), "XX".to_string()]);
        assert!(lang_list(std::iter::empty::<&str>()).is_empty());
        assert!(lang_list(["und", "zxx"]).is_empty());
    }

    #[test]
    fn quality_from_parsed_maps_every_variant() {
        use crate::scene::{Codec, ParsedRelease, Res, Source};
        let mk = |r, c, s| ParsedRelease {
            resolution: Some(r),
            codec: Some(c),
            source: Some(s),
            ..Default::default()
        };
        assert_eq!(
            quality_from_parsed(&mk(Res::R720, Codec::H264, Source::BluRay)),
            (Some("720p".into()), Some("x264".into()), Some("Bluray".into()))
        );
        assert_eq!(
            quality_from_parsed(&mk(Res::R1080, Codec::Av1, Source::WebDl)),
            (Some("1080p".into()), Some("AV1".into()), Some("WEBDL".into()))
        );
        assert_eq!(
            quality_from_parsed(&mk(Res::R2160, Codec::Xvid, Source::WebRip)),
            (Some("2160p".into()), Some("Xvid".into()), Some("WEBRip".into()))
        );
        assert_eq!(
            quality_from_parsed(&mk(Res::R2160, Codec::Hevc, Source::Remux)),
            (Some("2160p".into()), Some("x265".into()), Some("Remux".into()))
        );
        let hdtv = ParsedRelease { source: Some(Source::Hdtv), ..Default::default() };
        assert_eq!(quality_from_parsed(&hdtv).2.as_deref(), Some("HDTV"));
        let cam = ParsedRelease { source: Some(Source::Cam), ..Default::default() };
        assert_eq!(quality_from_parsed(&cam).2.as_deref(), Some("Cam"));
        assert_eq!(quality_from_parsed(&ParsedRelease::default()), (None, None, None));
    }
}
