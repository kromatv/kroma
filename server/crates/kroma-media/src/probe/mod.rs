//! Metadata extraction via the `ffprobe` CLI, never transcoding. A missing
//! ffprobe or output KROMA cannot parse falls back to a container-extension
//! guess; a file ffprobe itself refused is recorded as unreadable instead.

mod ffprobe_output;
mod parse;
mod run;

use kroma_module_wire::{AudioStream, SubtitleTrack, VideoStream};

pub use run::*;

fn duration_of(printed: &[u8]) -> Option<u64> {
    let secs: f64 = String::from_utf8_lossy(printed).trim().parse().ok()?;
    (secs > 0.0).then_some((secs * 1000.0) as u64)
}

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
