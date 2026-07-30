//! Media catalog types: kinds, stream descriptions, files, items and shows.
//!
//! The JSON shape here is a public contract web/TV clients depend on it, so
//! field names and casing must not drift.

use serde::{Deserialize, Serialize};

use crate::metadata::{CastMember, Metadata};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Movie,
    Episode,
    Video,
}

/// Video stream description (best-effort; fields may be null when unknown).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoStream {
    pub codec: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub hdr: bool,
    #[serde(rename = "bitDepth")]
    pub bit_depth: Option<u32>,
}

/// One audio stream/track. An item can carry several (e.g. EN + FR, or a
/// director's commentary); `index` is the audio-relative position (0-based
/// among audio streams only), matching ffmpeg's `-map 0:a:<index>` selector
/// used when remuxing a chosen track.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioStream {
    #[serde(default)]
    pub index: u32,
    pub codec: String,
    pub channels: Option<u32>,
    pub language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default)]
    pub default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleTrack {
    pub language: Option<String>,
    pub codec: String,
}

/// Outcome of the EBU R128 loudness analysis of an audio track.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AudioVerdict {
    Ok,
    HighDynamics,
    QuietDialog,
}

/// EBU R128 loudness measurement of an item's default audio track, produced by
/// the `pipeline.loudness` stage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioAnalysis {
    #[serde(rename = "lufsI")]
    pub lufs_i: f64,
    // Loudness range (LU); > ~15 is the classic "quiet dialogue, loud
    // explosions" mix.
    pub lra: f64,
    #[serde(rename = "truePeak")]
    pub true_peak: f64,
    // Centre-channel loudness (LUFS), measured for 5.1+ tracks only.
    #[serde(rename = "dialogLufs", default, skip_serializing_if = "Option::is_none")]
    pub dialog_lufs: Option<f64>,
    pub verdict: AudioVerdict,
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
    #[serde(skip)]
    pub abs_path: Option<String>,
}

/// A single playable media item. `rel_path` is relative to the owning media
/// directory; demo/seed items have `rel_path == None` and cannot be streamed.
///
/// An item can be backed by multiple physical [`MediaFile`]s; the top-level
/// `video`/`audio`/`duration_ms`/`container`/`subtitles`/`abs_path` fields
/// mirror the highest-resolution probed file, for clients that read
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
    #[serde(default)]
    pub files: Vec<MediaFile>,
    // Id of the representative file `/stream` serves and whose stream info
    // populates the top-level fields above. `None` until a file exists.
    #[serde(rename = "defaultFileId", default, skip_serializing_if = "Option::is_none")]
    pub default_file_id: Option<String>,
    // Episodes only. Empty until resolved from chapters or the
    // audio-fingerprint job.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub markers: Vec<Marker>,
    // `None` until the `pipeline.loudness` stage has measured it.
    #[serde(rename = "audioAnalysis", default, skip_serializing_if = "Option::is_none")]
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
