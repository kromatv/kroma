//! Release-name intelligence for the acquisition stack: parse scene/P2P
//! release titles ("Movie.2023.1080p.BluRay.x265-GROUP") into structured facts,
//! and judge releases and files against the quality rules an admin writes.
//! Pure computation, zero I/O.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Res {
    Sd,
    R720,
    R1080,
    R2160,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Codec {
    Hevc,
    H264,
    Av1,
    Vp9,
    Xvid,
}

/// Where the encode came from (Remux = untouched disc stream).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Source {
    Remux,
    BluRay,
    WebDl,
    WebRip,
    Hdtv,
    Dvd,
    Cam,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ParsedRelease {
    pub title: String,
    pub year: Option<u32>,
    pub resolution: Option<Res>,
    pub codec: Option<Codec>,
    pub source: Option<Source>,
    pub group: Option<String>,
    pub season: Option<u32>,
    #[serde(default)]
    pub season_end: Option<u32>,
    pub episode: Option<u32>,
    pub episode_end: Option<u32>,
    pub full_season: bool,
    pub proper: bool,
    pub repack: bool,
    pub hdr: bool,
    pub hdr10_plus: bool,
    pub hlg: bool,
    pub dolby_vision: bool,
    #[serde(default)]
    pub languages: Vec<Language>,
    #[serde(default)]
    pub multi: bool,
    #[serde(default)]
    pub subtitles: Vec<Language>,
    #[serde(default)]
    pub edition: Option<String>,
    #[serde(default)]
    pub audio_codec: Option<AudioCodec>,
    #[serde(default)]
    pub audio_channels: Option<u32>,
    #[serde(default)]
    pub air_date: Option<AirDate>,
}

/// What the caller is trying to fill; drives season/episode validation and
/// size bounds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    Movie { year: Option<u32> },
    Episode { season: u32, episode: u32 },
    Season { season: u32, episodes: u32 },
}

impl Target {
    /// How many episodes a release filling this target covers (a movie is one).
    pub fn episode_count(&self) -> u32 {
        match *self {
            Target::Season { episodes, .. } => episodes.max(1),
            _ => 1,
        }
    }
}

/// What a `rule` needs to be said in the reader's own language. English prose
/// stays in `note` for a caller that has nowhere to translate.
pub type Params = serde_json::Map<String, serde_json::Value>;

/// One line of the explanation, persisted with the grab so "why this release"
/// stays answerable later.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScoreLine {
    pub rule: String,
    pub delta: i32,
    pub note: String,
    #[serde(default)]
    pub params: Params,
}

/// Why a profile would not take a release. `rule` is the stable code a screen
/// translates; `note` is the same thing in English.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Reject {
    pub rule: String,
    pub note: String,
    #[serde(default)]
    pub params: Params,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct Candidate {
    pub size_bytes: Option<u64>,
    pub seeders: Option<u32>,
    pub indexer_priority: i32,
}

mod air_date;
mod condition;
mod content;
mod decide;
mod defaults;
mod facts;
mod format;
mod language;
mod parse;
mod profile;
mod quality;
mod shape;
mod terms;
mod upgrade;

pub use air_date::AirDate;
pub use condition::{Condition, Spec};
pub use content::{classify, ContentFile, ContentKind, TorrentContent};
pub use decide::{evaluate, judge, rank, Evaluation, Judged, MatchedFormat, Query, Rules};
pub use defaults::{default_formats, default_sizes, LegacySettings};
pub use facts::{
    AudioCodec, AudioFact, Facts, HdrFormat, IndexerFlag, LanguageSet, Probe, ReleaseType,
};
pub use format::{CustomFormat, FormatError, FormatSet};
pub use language::Language;
pub use parse::parse_release_name;
pub use profile::{QualityProfile, QualityTier, SizeLimit, Sizes};
pub use quality::Quality;
pub use upgrade::{cutoff_unmet, upgrade_verdict, Reason, Verdict};

#[cfg(test)]
mod tests;

pub mod module;
pub use module::MODULE;
