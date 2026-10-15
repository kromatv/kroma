use std::collections::BTreeMap;

use crate::{
    Codec, Condition, CustomFormat, HdrFormat, Quality, QualityProfile, QualityTier, Res,
    SizeLimit, Sizes, Spec,
};

/// The acquisition settings that predate profiles, read once to build the
/// first profile so an upgraded server keeps grabbing what it grabbed.
#[derive(Debug, Clone, PartialEq)]
pub struct LegacySettings {
    pub resolution: Res,
    pub prefer_hevc: bool,
    pub min_seeders: u32,
    pub max_gb_movie: u64,
    pub max_gb_episode: u64,
    pub required_keywords: Vec<String>,
    pub forbidden_keywords: Vec<String>,
}

const MOVIE_RUNTIME: u32 = 120;
const EPISODE_RUNTIME: u32 = 45;

fn condition(spec: Spec) -> Condition {
    Condition {
        negate: false,
        required: false,
        spec,
    }
}

fn required(spec: Spec) -> Condition {
    Condition {
        required: true,
        ..condition(spec)
    }
}

fn format(id: &str, name: &str, conditions: Vec<Condition>) -> CustomFormat {
    CustomFormat {
        id: id.into(),
        name: name.into(),
        conditions,
    }
}

fn language(value: &str) -> Spec {
    Spec::Language {
        value: value.into(),
    }
}

/// The formats a new server starts with: picture, codec and the French
/// language variants. Every one is editable and removable.
pub fn default_formats() -> Vec<CustomFormat> {
    let hdr = |id: &str, name: &str, value: HdrFormat| {
        format(id, name, vec![condition(Spec::Hdr { value: Some(value) })])
    };
    let codec = |id: &str, name: &str, value: Codec| {
        format(id, name, vec![condition(Spec::VideoCodec { value })])
    };
    vec![
        hdr("dolby-vision", "Dolby Vision", HdrFormat::DolbyVision),
        hdr("hdr10-plus", "HDR10+", HdrFormat::Hdr10Plus),
        hdr("hdr10", "HDR10", HdrFormat::Hdr10),
        codec("hevc", "HEVC", Codec::Hevc),
        codec("av1", "AV1", Codec::Av1),
        codec("xvid", "Xvid / DivX", Codec::Xvid),
        format("vo", "VO", vec![condition(language("original"))]),
        format("vff", "VFF", vec![condition(language("fr-FR"))]),
        format("vfq", "VFQ", vec![condition(language("fr-CA"))]),
        format(
            "vf2",
            "VF2",
            vec![required(language("fr-FR")), required(language("fr-CA"))],
        ),
        format("french", "Français", vec![condition(language("fr"))]),
        format(
            "vo-vff",
            "VO + VFF",
            vec![required(language("original")), required(language("fr-FR"))],
        ),
        format(
            "multi",
            "MULTi",
            vec![condition(Spec::ReleaseTitle {
                pattern: r"\bmulti\d?\b".into(),
            })],
        ),
        format(
            "vostfr",
            "VOSTFR",
            vec![
                required(language("original")),
                required(Spec::Subtitle { value: "fr".into() }),
                Condition {
                    negate: true,
                    required: true,
                    spec: language("fr"),
                },
            ],
        ),
    ]
}

/// The sizes a new server starts with: the old per-film and per-episode caps
/// spread over the assumed runtimes, preferring half of each cap.
pub fn default_sizes(legacy: &LegacySettings) -> Sizes {
    let table = |cap_gb: u64, runtime: u32| -> Vec<SizeLimit> {
        let max = (cap_gb > 0).then(|| cap_gb as f64 * 1024.0 / f64::from(runtime));
        Quality::ALL
            .iter()
            .map(|&quality| SizeLimit {
                quality,
                min: 0.0,
                preferred: max.map(|max| max / 2.0),
                max,
            })
            .collect()
    };
    Sizes {
        movie: table(legacy.max_gb_movie, MOVIE_RUNTIME),
        episode: table(legacy.max_gb_episode, EPISODE_RUNTIME),
        movie_runtime: MOVIE_RUNTIME,
        episode_runtime: EPISODE_RUNTIME,
    }
}

fn tier(allowed: bool, qualities: &[Quality]) -> QualityTier {
    QualityTier {
        name: None,
        qualities: qualities.to_vec(),
        allowed,
    }
}

fn tiers_at(resolution: Res, allowed: bool) -> Vec<QualityTier> {
    use Quality as Q;
    let groups: &[&[Quality]] = match resolution {
        Res::R2160 => &[
            &[Q::Remux2160],
            &[Q::Bluray2160, Q::WebDl2160, Q::Unknown2160],
            &[Q::WebRip2160],
            &[Q::Hdtv2160],
        ],
        Res::R1080 => &[
            &[Q::Remux1080],
            &[Q::Bluray1080, Q::WebDl1080, Q::Unknown1080],
            &[Q::WebRip1080],
            &[Q::Hdtv1080],
        ],
        Res::R720 => &[
            &[Q::Bluray720, Q::WebDl720, Q::Unknown720],
            &[Q::WebRip720],
            &[Q::Hdtv720],
        ],
        Res::Sd => &[
            &[Q::BluraySd, Q::WebDlSd, Q::Dvd, Q::UnknownSd],
            &[Q::WebRipSd],
            &[Q::Sdtv],
        ],
    };
    groups
        .iter()
        .map(|qualities| tier(allowed, qualities))
        .collect()
}

fn legacy_tiers(resolution: Res) -> Vec<QualityTier> {
    let order: [(Res, bool); 4] = match resolution {
        Res::R2160 => [
            (Res::R2160, true),
            (Res::R1080, true),
            (Res::R720, true),
            (Res::Sd, false),
        ],
        Res::R1080 | Res::Sd => [
            (Res::R1080, true),
            (Res::R720, true),
            (Res::R2160, false),
            (Res::Sd, false),
        ],
        Res::R720 => [
            (Res::R720, true),
            (Res::R1080, true),
            (Res::R2160, false),
            (Res::Sd, false),
        ],
    };
    let mut tiers: Vec<QualityTier> = order
        .into_iter()
        .flat_map(|(resolution, allowed)| tiers_at(resolution, allowed))
        .collect();
    tiers.push(tier(false, &[Quality::Unknown, Quality::Cam]));
    tiers
}

fn legacy_cutoff(resolution: Res) -> Quality {
    match resolution {
        Res::R2160 => Quality::Bluray2160,
        Res::R720 => Quality::Bluray720,
        Res::R1080 | Res::Sd => Quality::Bluray1080,
    }
}

impl QualityProfile {
    /// The profile the old settings described, ranked the way their scores
    /// ranked: the chosen resolution first, Blu-ray and WEB-DL as equals, HEVC
    /// and HDR as format points.
    pub fn from_legacy(id: &str, name: &str, legacy: &LegacySettings) -> Self {
        let scores: BTreeMap<String, i32> = [
            ("hevc", if legacy.prefer_hevc { 400 } else { 100 }),
            ("av1", 150),
            ("xvid", -10_000),
            ("dolby-vision", 150),
            ("hdr10-plus", 120),
            ("hdr10", 100),
        ]
        .into_iter()
        .map(|(id, score)| (id.to_string(), score))
        .collect();
        Self {
            id: id.into(),
            name: name.into(),
            tiers: legacy_tiers(legacy.resolution),
            cutoff: legacy_cutoff(legacy.resolution),
            upgrades_allowed: true,
            format_scores: scores,
            min_format_score: 0,
            upgrade_until_score: 0,
            min_upgrade_increment: 1,
            must_contain: legacy.required_keywords.clone(),
            must_not_contain: legacy.forbidden_keywords.clone(),
            min_seeders: legacy.min_seeders,
            add_beside: false,
        }
    }
}
