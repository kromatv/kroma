use serde::{Deserialize, Serialize};

use crate::{AudioCodec, Codec, Facts, HdrFormat, IndexerFlag, ReleaseType, Res, Source};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Condition {
    #[serde(default)]
    pub negate: bool,
    #[serde(default)]
    pub required: bool,
    #[serde(flatten)]
    pub spec: Spec,
}

/// What one condition tests. `language` takes a tag (`fr`, `fr-CA`) or
/// `original`, the title's own language; `year` and `size` bound an open range
/// when one end is left out.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Spec {
    ReleaseTitle {
        pattern: String,
    },
    ReleaseGroup {
        pattern: String,
    },
    Edition {
        pattern: String,
    },
    Language {
        value: String,
    },
    Subtitle {
        value: String,
    },
    Source {
        value: Source,
    },
    Resolution {
        value: Res,
    },
    VideoCodec {
        value: Codec,
    },
    Hdr {
        value: Option<HdrFormat>,
    },
    #[serde(rename_all = "camelCase")]
    Audio {
        codec: Option<AudioCodec>,
        min_channels: Option<u32>,
    },
    #[serde(rename_all = "camelCase")]
    Size {
        min_gb: Option<f64>,
        max_gb: Option<f64>,
    },
    IndexerFlag {
        value: IndexerFlag,
    },
    ReleaseType {
        value: ReleaseType,
    },
    Year {
        min: Option<u32>,
        max: Option<u32>,
    },
}

impl Spec {
    pub(crate) fn kind(&self) -> &'static str {
        match self {
            Spec::ReleaseTitle { .. } => "releaseTitle",
            Spec::ReleaseGroup { .. } => "releaseGroup",
            Spec::Edition { .. } => "edition",
            Spec::Language { .. } => "language",
            Spec::Subtitle { .. } => "subtitle",
            Spec::Source { .. } => "source",
            Spec::Resolution { .. } => "resolution",
            Spec::VideoCodec { .. } => "videoCodec",
            Spec::Hdr { .. } => "hdr",
            Spec::Audio { .. } => "audio",
            Spec::Size { .. } => "size",
            Spec::IndexerFlag { .. } => "indexerFlag",
            Spec::ReleaseType { .. } => "releaseType",
            Spec::Year { .. } => "year",
        }
    }
}

pub(crate) fn spec_holds(spec: &Spec, facts: &Facts) -> bool {
    match spec {
        Spec::Source { value } => facts.source == Some(*value),
        Spec::Resolution { value } => facts.resolution == Some(*value),
        Spec::VideoCodec { value } => facts.codec == Some(*value),
        Spec::Hdr { value: None } => !facts.hdr.is_empty(),
        Spec::Hdr {
            value: Some(format),
        } => facts.hdr.contains(format),
        Spec::Audio {
            codec,
            min_channels,
        } => facts.audio.iter().any(|track| {
            codec.is_none_or(|codec| track.codec == Some(codec))
                && min_channels.is_none_or(|min| track.channels.is_some_and(|c| c >= min))
        }),
        Spec::Size { min_gb, max_gb } => facts.size_bytes.is_some_and(|bytes| {
            let gb = bytes as f64 / 1_073_741_824.0;
            min_gb.is_none_or(|min| gb >= min) && max_gb.is_none_or(|max| gb <= max)
        }),
        Spec::IndexerFlag { value } => facts.flags.contains(value),
        Spec::ReleaseType { value } => facts.release_type == Some(*value),
        Spec::Year { min, max } => facts.year.is_some_and(|year| {
            min.is_none_or(|min| year >= min) && max.is_none_or(|max| year <= max)
        }),
        Spec::ReleaseTitle { .. }
        | Spec::ReleaseGroup { .. }
        | Spec::Edition { .. }
        | Spec::Language { .. }
        | Spec::Subtitle { .. } => false,
    }
}
