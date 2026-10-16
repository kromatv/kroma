//! What a title already holds, judged by the same rules as a release: each
//! file's facts read from its probe, and from the release name it was imported
//! under when this module placed it.

use anyhow::Result;
use kroma_module_sdk::db::{self, TitleFile};
use kroma_module_sdk::domain::{HdrFormat as ProbedHdr, MediaFile};
use kroma_module_sdk::engine::model::RequestKind;
use kroma_module_sdk::host::HostStorage;
use kroma_module_sdk::primitives::language::language_code;
use kroma_scene::{
    AudioCodec, AudioFact, Evaluation, Facts, HdrFormat, Language, Probe, Rules, cutoff_unmet,
    evaluate,
};
use serde::Serialize;

use super::store;

/// One file on disk, judged.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JudgedFile {
    pub file_id: String,
    pub rel_path: Option<String>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub episode_end: Option<u32>,
    pub release: Option<String>,
    pub evaluation: Evaluation,
    pub below_target: bool,
}

impl JudgedFile {
    /// Whether this file holds `episode` of `season` (always, for a film).
    pub fn holds(&self, season: Option<u32>, episode: Option<u32>) -> bool {
        match (season, episode) {
            (None, None) => self.season.is_none(),
            (Some(s), None) => self.season == Some(s),
            (Some(s), Some(e)) => {
                self.season == Some(s)
                    && self.episode.is_some_and(|first| {
                        (first..=self.episode_end.unwrap_or(first)).contains(&e)
                    })
            }
            (None, Some(_)) => false,
        }
    }
}

/// Every file of a title, judged under `rules`.
pub fn judge_title_files<S: HostStorage>(
    state: &S,
    kind: RequestKind,
    tmdb_id: u64,
    rules: &Rules,
    original: Option<&Language>,
) -> Result<Vec<JudgedFile>> {
    let conn = state.db().get()?;
    let files = db::title_files(&conn, kind, tmdb_id)?;
    drop(conn);
    files
        .into_iter()
        .map(|held| judge_file(state, held, rules, original))
        .collect()
}

fn judge_file<S: HostStorage>(
    state: &S,
    held: TitleFile,
    rules: &Rules,
    original: Option<&Language>,
) -> Result<JudgedFile> {
    let release = match held.file.abs_path.as_deref() {
        Some(path) => store::release_of(state.store(), path)?,
        None => None,
    };
    let facts = file_facts(&held.file, release.as_deref());
    let evaluation = evaluate(&facts, original, rules);
    Ok(JudgedFile {
        file_id: held.file.id.clone(),
        rel_path: held.file.rel_path.clone(),
        season: held.season,
        episode: held.episode,
        episode_end: held.episode_end,
        below_target: cutoff_unmet(std::slice::from_ref(&evaluation), rules.profile),
        evaluation,
        release,
    })
}

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

    #[test]
    fn a_run_file_holds_each_episode_in_it() {
        let judged = JudgedFile {
            file_id: "f1".into(),
            rel_path: None,
            season: Some(1),
            episode: Some(3),
            episode_end: Some(4),
            release: None,
            evaluation: Evaluation {
                quality: kroma_scene::Quality::WebDl1080,
                quality_rank: Some(1),
                formats: Vec::new(),
                format_score: 0,
                revision: 1,
            },
            below_target: false,
        };

        assert!(judged.holds(Some(1), Some(4)));
        assert!(judged.holds(Some(1), None));
        assert!(!judged.holds(Some(1), Some(5)));
        assert!(!judged.holds(None, None));
    }
}
