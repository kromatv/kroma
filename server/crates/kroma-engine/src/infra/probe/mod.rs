//! Metadata extraction via the `ffprobe` CLI, never transcoding. A missing
//! ffprobe or output KROMA cannot parse falls back to a container-extension
//! guess; a file ffprobe itself refused is recorded as unreadable instead.

mod ffprobe_output;
mod markers;
mod parse;
mod pass;
mod run;

use crate::model::{AudioStream, SubtitleTrack, VideoStream};

pub use markers::markers_from_chapters;
pub use pass::*;
pub use run::*;

/// All fields are best-effort. A set `unreadable` carries ffprobe's reason the
/// container would not open, and every other field is then empty.
#[derive(Debug, Default)]
pub struct ProbeResult {
    pub duration_ms: Option<u64>,
    pub video: Option<VideoStream>,
    pub audio: Option<AudioStream>,
    // In container order: an audio-relative index is a position in here.
    pub audio_tracks: Vec<AudioStream>,
    pub subtitles: Vec<SubtitleTrack>,
    pub chapters: Vec<Chapter>,
    pub unreadable: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Chapter {
    pub start_ms: u64,
    pub end_ms: u64,
    pub title: Option<String>,
}
