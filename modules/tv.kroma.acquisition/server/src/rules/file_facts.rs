use kroma_module_sdk::domain::{HdrFormat as ProbedHdr, MediaFile};
use kroma_module_sdk::primitives::language::language_code;
use kroma_scene::{AudioCodec, AudioFact, Facts, HdrFormat, Language, Probe};

/// The facts a file shows: its release name (or its own name) for what only a
/// name says, its probe for everything the probe measured.
pub fn file_facts(file: &MediaFile, release: Option<&str>) -> Facts {
    let name = release.map(str::to_string).unwrap_or_else(|| stem(file));
    let parsed = kroma_scene::parse_release_name(&name);
    let mut facts = Facts::from_release(&name, &parsed, file.size);
    if file.edition.is_some() {
        facts.edition = file.edition.clone();
    }
    if !file.probed {
        return facts;
    }
    facts.overlay_probe(probe_of(file))
}

fn stem(file: &MediaFile) -> String {
    let path = file.rel_path.as_deref().unwrap_or(&file.id);
    let name = path.rsplit(['/', '\\']).next().unwrap_or(path);
    match name.rsplit_once('.') {
        Some((stem, _)) => stem.to_string(),
        None => name.to_string(),
    }
}

fn probe_of(file: &MediaFile) -> Probe {
    let video = file.video.as_ref();
    Probe {
        width: video.and_then(|v| v.width),
        height: video.and_then(|v| v.height),
        video_codec: video.map(|v| v.codec.clone()),
        hdr: video.map(hdr_of).unwrap_or_default(),
        audio: file
            .audio_tracks
            .iter()
            .map(|track| AudioFact {
                language: spoken(track.language.as_deref(), track.region.as_deref()),
                codec: AudioCodec::from_probe(&track.codec),
                channels: track.channels,
            })
            .collect(),
        subtitles: file
            .subtitles
            .iter()
            .filter_map(|track| spoken(track.language.as_deref(), None))
            .collect(),
        size_bytes: file.size,
    }
}

fn spoken(language: Option<&str>, region: Option<&str>) -> Option<Language> {
    language
        .and_then(language_code)
        .map(|code| Language::new(code, region))
}

// A Dolby Vision profile 7 or 8 stream carries an HDR10 base layer, which is
// what a player without Dolby Vision shows, so it counts as both.
fn hdr_of(video: &kroma_module_sdk::domain::VideoStream) -> Vec<HdrFormat> {
    let mut formats = match video.hdr_format {
        Some(ProbedHdr::DolbyVision) => vec![HdrFormat::DolbyVision],
        Some(ProbedHdr::Hdr10Plus) => vec![HdrFormat::Hdr10Plus],
        Some(ProbedHdr::Hdr10) => vec![HdrFormat::Hdr10],
        Some(ProbedHdr::Hlg) => vec![HdrFormat::Hlg],
        None if video.hdr => vec![HdrFormat::Hdr10],
        None => Vec::new(),
    };
    if matches!(video.dolby_vision_profile, Some(7 | 8)) {
        formats.push(HdrFormat::Hdr10);
    }
    formats
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_module_sdk::domain::{AudioStream, VideoStream};

    fn file() -> MediaFile {
        MediaFile {
            id: "f1".into(),
            rel_path: Some("Show/Season 01/Show - S01E01 - 1080p.mkv".into()),
            container: "mkv".into(),
            size: Some(2_000_000_000),
            edition: None,
            probed: true,
            unreadable: None,
            duration_ms: Some(2_700_000),
            abs_path: Some("/x/e1.mkv".into()),
            video: Some(VideoStream {
                codec: "hevc".into(),
                width: Some(3840),
                height: Some(2160),
                hdr: true,
                bit_depth: Some(10),
                hdr_format: Some(ProbedHdr::DolbyVision),
                dolby_vision_profile: Some(8),
                color: None,
            }),
            audio: None,
            audio_tracks: vec![
                AudioStream {
                    index: 0,
                    codec: "eac3".into(),
                    channels: Some(6),
                    language: Some("eng".into()),
                    title: None,
                    default: true,
                    region: None,
                },
                AudioStream {
                    index: 1,
                    codec: "ac3".into(),
                    channels: Some(6),
                    language: Some("fre".into()),
                    title: Some("VFQ".into()),
                    default: false,
                    region: Some("CA".into()),
                },
            ],
            subtitles: Vec::new(),
            edition_id: None,
        }
    }

    #[test]
    fn a_probed_file_is_judged_by_what_it_decodes_to() {
        let facts = file_facts(&file(), None);

        assert_eq!(facts.resolution, Some(kroma_scene::Res::R2160));
        assert_eq!(facts.hdr, [HdrFormat::DolbyVision, HdrFormat::Hdr10]);
        assert!(facts.languages.has(&Language::new("fr", Some("CA")), None));
        assert!(!facts.languages.has(&Language::new("fr", Some("FR")), None));
    }

    #[test]
    fn the_release_it_came_under_says_what_the_name_lost() {
        let facts = file_facts(&file(), Some("Show.S01E01.2160p.BluRay.REMUX.HEVC-GRP"));

        assert_eq!(facts.source, Some(kroma_scene::Source::Remux));
        assert_eq!(facts.group.as_deref(), Some("GRP"));
    }

    #[test]
    fn an_unprobed_file_keeps_what_its_name_says() {
        let mut unprobed = file();
        unprobed.probed = false;

        let facts = file_facts(&unprobed, None);

        assert_eq!(facts.resolution, Some(kroma_scene::Res::R1080));
        assert!(facts.languages.original);
    }
}
