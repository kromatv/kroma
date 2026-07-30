//! Metadata extraction via the `ffprobe` CLI, never transcoding. When ffprobe is
//! missing or fails on a file, the codec is inferred from the container extension
//! and unknown fields are left null.

mod markers;
mod parse;
mod run;

use crate::model::{AudioStream, SubtitleTrack, VideoStream};

pub use markers::markers_from_chapters;
pub use run::*;

/// All fields are best-effort.
#[derive(Debug, Default)]
pub struct ProbeResult {
    pub duration_ms: Option<u64>,
    pub video: Option<VideoStream>,
    pub audio: Option<AudioStream>,
    // In container order: an audio-relative index is a position in here.
    pub audio_tracks: Vec<AudioStream>,
    pub subtitles: Vec<SubtitleTrack>,
    pub chapters: Vec<Chapter>,
}

#[derive(Debug, Clone)]
pub struct Chapter {
    pub start_ms: u64,
    pub end_ms: u64,
    pub title: Option<String>,
}
