//! The media catalog's entities: kinds, files, items, shows and seasons.
//! A track's own description is in [`streams`], the edition level in [`edition`],
//! and which of a title's files is preferred in [`preference`].
//!
//! The JSON shape here is a public contract web/TV clients depend on it, so
//! field names and casing must not drift.

mod edition;
mod preference;
mod streams;

pub use edition::*;
pub use preference::*;
pub use streams::*;

use serde::{Deserialize, Serialize};

use crate::metadata::{CastMember, Metadata};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Movie,
    Episode,
    Video,
}

/// One physical file backing a logical [`MediaItem`]. A single item can have
/// several of these (Director's Cut + Theatrical, 1080p + 4K, …); they all share
/// the same logical item id but each maps to a distinct file on disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaFile {
    // `short_hash(abs_path)`, stable per physical file.
    pub id: String,
    #[serde(rename = "relPath")]
    pub rel_path: Option<String>,
    pub container: String,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<u64>,
    pub video: Option<VideoStream>,
    pub audio: Option<AudioStream>,
    #[serde(rename = "audioTracks", default)]
    pub audio_tracks: Vec<AudioStream>,
    pub subtitles: Vec<SubtitleTrack>,
    pub size: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub edition: Option<String>,
    // `false` until ffprobe has run (phase 2); the stream fields above are
    // null until then.
    pub probed: bool,
    // ffprobe's own reason the container would not open.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unreadable: Option<String>,
    // Which of the owning item's editions this file realises. Filled by the read
    // path, which knows the item; a scan does not yet.
    #[serde(rename = "editionId", default, skip_serializing_if = "Option::is_none")]
    pub edition_id: Option<String>,
    #[serde(skip)]
    pub abs_path: Option<String>,
}

/// A single playable media item. `rel_path` is relative to the owning media
/// directory; demo/seed items have `rel_path == None` and cannot be streamed.
///
/// An item can be backed by multiple physical [`MediaFile`]s; the top-level
/// `video`/`audio`/`duration_ms`/`container`/`subtitles`/`abs_path` fields
/// mirror the preferred one ([`by_preference`]), for clients that read
/// `item.video.codec` directly.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaItem {
    pub id: String,
    pub title: String,
    pub kind: Kind,
    pub year: Option<u32>,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<u64>,
    pub container: String,
    pub video: Option<VideoStream>,
    pub audio: Option<AudioStream>,
    #[serde(rename = "audioTracks", default)]
    pub audio_tracks: Vec<AudioStream>,
    pub subtitles: Vec<SubtitleTrack>,
    pub library: String,
    #[serde(rename = "showId")]
    pub show_id: Option<String>,
    #[serde(rename = "showTitle")]
    pub show_title: Option<String>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    #[serde(rename = "episodeEnd")]
    pub episode_end: Option<u32>,
    #[serde(rename = "episodeTitle")]
    pub episode_title: Option<String>,
    #[serde(rename = "relPath")]
    pub rel_path: Option<String>,
    #[serde(rename = "addedAt")]
    pub added_at: String,
    // `None` until the background enrichment pass resolves it. Movies only;
    // episodes inherit their show's metadata.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Metadata>,
    // Mirrors the representative file's path so `/stream` keeps working.
    #[serde(skip)]
    pub abs_path: Option<String>,
    // Best-first: MEDIA-8's rank, so `files[0]` is the preferred file of the
    // preferred edition.
    #[serde(default)]
    pub files: Vec<MediaFile>,
    // The cuts this title has, the one holding the preferred file first. Every
    // entry exists because a file named it, and every file names exactly one.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub editions: Vec<Edition>,
    // Id of the representative file `/stream` serves and whose stream info
    // populates the top-level fields above. `None` until a file exists.
    #[serde(
        rename = "defaultFileId",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub default_file_id: Option<String>,
    // Episodes only. Empty until resolved from chapters or the
    // audio-fingerprint job.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub markers: Vec<Marker>,
    // `None` until the `pipeline.loudness` stage has measured it.
    #[serde(
        rename = "audioAnalysis",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub audio_analysis: Option<AudioAnalysis>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MarkerKind {
    Intro,
    Credits,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Marker {
    pub kind: MarkerKind,
    #[serde(rename = "startMs")]
    pub start_ms: u64,
    #[serde(rename = "endMs")]
    pub end_ms: u64,
}

/// A TV show aggregate (not a file). Built by grouping episodes during a scan.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Show {
    pub id: String,
    pub title: String,
    pub year: Option<u32>,
    pub library: String,
    #[serde(rename = "seasonCount")]
    pub season_count: u32,
    #[serde(rename = "episodeCount")]
    pub episode_count: u32,
    // From a representative episode, for quality badges.
    pub video: Option<VideoStream>,
    #[serde(rename = "addedAt")]
    pub added_at: String,
    // `None` until the background enrichment pass resolves it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Metadata>,
    // Series-completion percent (0-100) when the request is authenticated;
    // `None` for anonymous requests or shows with no progress.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<u8>,
}

/// Sorted by episode number.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Season {
    pub number: u32,
    pub episodes: Vec<MediaItem>,
    // Empty until enriched, or when the provider returned none.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cast: Vec<CastMember>,
}

/// `GET /api/shows/:id` payload: a show plus its seasons.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShowDetail {
    pub show: Show,
    pub seasons: Vec<Season>,
}

/// One cover of the anonymous sign-in splash (`GET /api/splash`): enough to
/// paint a backdrop and caption it, and deliberately nothing more.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplashEntry {
    /// `movie` or `show`.
    pub kind: String,
    pub title: String,
    pub year: Option<u32>,
    #[serde(rename = "backdropUrl")]
    pub backdrop_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rating: Option<f64>,
}
