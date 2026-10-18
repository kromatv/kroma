use serde::{Deserialize, Serialize};

use crate::{Codec, Language, ParsedRelease, Quality, Res, Source};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HdrFormat {
    Hdr10,
    Hdr10Plus,
    DolbyVision,
    Hlg,
}

impl HdrFormat {
    /// Reads the core's probe spelling (`hdr10`, `hdr10Plus`, `dolbyVision`, `hlg`).
    pub fn from_probe(format: &str) -> Option<Self> {
        match format {
            "hdr10" => Some(Self::Hdr10),
            "hdr10Plus" => Some(Self::Hdr10Plus),
            "dolbyVision" => Some(Self::DolbyVision),
            "hlg" => Some(Self::Hlg),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AudioCodec {
    TrueHd,
    DtsX,
    DtsHdMa,
    DtsHd,
    Dts,
    Eac3,
    Ac3,
    Aac,
    Flac,
    Opus,
    Pcm,
    Mp3,
}

impl AudioCodec {
    /// Reads an ffprobe codec name (`eac3`, `pcm_s24le`...).
    pub fn from_probe(codec: &str) -> Option<Self> {
        let codec = codec.to_ascii_lowercase();
        match codec.as_str() {
            "truehd" | "mlp" => Some(Self::TrueHd),
            "dts" | "dca" => Some(Self::Dts),
            "eac3" => Some(Self::Eac3),
            "ac3" => Some(Self::Ac3),
            "aac" => Some(Self::Aac),
            "flac" => Some(Self::Flac),
            "opus" => Some(Self::Opus),
            "mp3" => Some(Self::Mp3),
            c if c.starts_with("pcm") => Some(Self::Pcm),
            _ => None,
        }
    }
}

impl Codec {
    /// Reads an ffprobe codec name (`hevc`, `h264`, `mpeg4`...).
    pub fn from_probe(codec: &str) -> Option<Self> {
        match codec.to_ascii_lowercase().as_str() {
            "hevc" | "h265" => Some(Self::Hevc),
            "h264" | "avc" | "avc1" => Some(Self::H264),
            "av1" => Some(Self::Av1),
            "vp9" => Some(Self::Vp9),
            "mpeg4" | "xvid" | "divx" | "msmpeg4v3" => Some(Self::Xvid),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum IndexerFlag {
    Freeleech,
    Internal,
    Scene,
}

/// What a release covers, as its name says it. A film says nothing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReleaseType {
    SingleEpisode,
    MultiEpisode,
    SeasonPack,
}

impl ReleaseType {
    pub fn of(parsed: &ParsedRelease) -> Option<Self> {
        if parsed.full_season {
            Some(Self::SeasonPack)
        } else if parsed.episode_end.is_some() {
            Some(Self::MultiEpisode)
        } else if parsed.episode.is_some() {
            Some(Self::SingleEpisode)
        } else {
            None
        }
    }
}

/// The audio languages a release or a file carries. `original` stands for the
/// title's own language when the name implies it without naming it: a release
/// with no language tag, or a `MULTi` one.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageSet {
    pub original: bool,
    pub explicit: Vec<Language>,
}

impl LanguageSet {
    /// True when some track answers for `wanted`, `original` being the title's
    /// original language when the metadata knows it.
    pub fn has(&self, wanted: &Language, original: Option<&Language>) -> bool {
        self.explicit.iter().any(|lang| lang.satisfies(wanted))
            || (self.original && original.is_some_and(|lang| lang.satisfies(wanted)))
    }

    pub fn has_original(&self, original: Option<&Language>) -> bool {
        self.original
            || original
                .is_some_and(|wanted| self.explicit.iter().any(|lang| lang.code == wanted.code))
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioFact {
    pub language: Option<Language>,
    pub codec: Option<AudioCodec>,
    pub channels: Option<u32>,
}

/// Everything the rules judge, read the same way from a release and from a
/// file on disk so one rule decides both.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Facts {
    pub name: String,
    pub group: Option<String>,
    pub edition: Option<String>,
    #[serde(default)]
    pub release_type: Option<ReleaseType>,
    #[serde(default)]
    pub year: Option<u32>,
    pub resolution: Option<Res>,
    pub source: Option<Source>,
    pub codec: Option<Codec>,
    pub hdr: Vec<HdrFormat>,
    pub languages: LanguageSet,
    pub subtitles: Vec<Language>,
    pub audio: Vec<AudioFact>,
    pub size_bytes: Option<u64>,
    pub revision: u32,
    pub flags: Vec<IndexerFlag>,
}

/// What the probe measured about a file. Where it measured something, it wins
/// over the name: a file named `2160p` that decodes at 1080p is 1080p.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Probe {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub video_codec: Option<String>,
    pub hdr: Vec<HdrFormat>,
    pub audio: Vec<AudioFact>,
    pub subtitles: Vec<Language>,
    pub size_bytes: Option<u64>,
}

impl Facts {
    pub fn from_release(name: &str, parsed: &ParsedRelease, size_bytes: Option<u64>) -> Self {
        Self {
            name: name.to_string(),
            group: parsed.group.clone(),
            edition: parsed.edition.clone(),
            release_type: ReleaseType::of(parsed),
            year: parsed.year,
            resolution: parsed.resolution,
            source: parsed.source,
            codec: parsed.codec,
            hdr: release_hdr(parsed),
            languages: LanguageSet {
                original: parsed.multi || parsed.languages.is_empty(),
                explicit: parsed.languages.clone(),
            },
            subtitles: parsed.subtitles.clone(),
            audio: release_audio(parsed),
            size_bytes,
            revision: 1 + u32::from(parsed.proper) + u32::from(parsed.repack),
            flags: Vec::new(),
        }
    }

    pub fn with_flags(mut self, flags: impl IntoIterator<Item = IndexerFlag>) -> Self {
        self.flags = flags.into_iter().collect();
        self
    }

    pub fn overlay_probe(mut self, probe: Probe) -> Self {
        if let Some(resolution) = Res::from_dimensions(probe.width, probe.height) {
            self.resolution = Some(resolution);
        }
        if let Some(codec) = probe.video_codec.as_deref().and_then(Codec::from_probe) {
            self.codec = Some(codec);
        }
        if !probe.hdr.is_empty() || probe.width.is_some() {
            self.hdr = probe.hdr;
        }
        let spoken: Vec<Language> = probe
            .audio
            .iter()
            .filter_map(|track| track.language.clone())
            .collect();
        if !spoken.is_empty() {
            self.languages = LanguageSet {
                original: false,
                explicit: dedup(spoken),
            };
        }
        if !probe.audio.is_empty() {
            self.audio = probe.audio;
        }
        if !probe.subtitles.is_empty() {
            self.subtitles = dedup(probe.subtitles);
        }
        self.size_bytes = probe.size_bytes.or(self.size_bytes);
        self
    }

    pub fn quality(&self) -> Quality {
        Quality::of(self.source, self.resolution)
    }
}

fn dedup(mut languages: Vec<Language>) -> Vec<Language> {
    let mut seen = std::collections::HashSet::new();
    languages.retain(|lang| seen.insert(lang.clone()));
    languages
}

fn release_hdr(parsed: &ParsedRelease) -> Vec<HdrFormat> {
    [
        (parsed.dolby_vision, HdrFormat::DolbyVision),
        (parsed.hdr10_plus, HdrFormat::Hdr10Plus),
        (parsed.hdr && !parsed.hdr10_plus, HdrFormat::Hdr10),
        (parsed.hlg, HdrFormat::Hlg),
    ]
    .into_iter()
    .filter_map(|(present, format)| present.then_some(format))
    .collect()
}

fn release_audio(parsed: &ParsedRelease) -> Vec<AudioFact> {
    if parsed.audio_codec.is_none() && parsed.audio_channels.is_none() {
        return Vec::new();
    }
    vec![AudioFact {
        language: None,
        codec: parsed.audio_codec,
        channels: parsed.audio_channels,
    }]
}
