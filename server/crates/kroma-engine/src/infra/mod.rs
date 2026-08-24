//! Outbound adapters: OS/process/network/filesystem integrations.
//!
//! These modules shell out to external tools (`ffprobe`, `ffmpeg`, `curl`),
//! touch the filesystem, advertise over mDNS, sample system metrics, and bridge
//! live events the edges where KROMA talks to the world outside the process.

pub mod crashbuf;
pub mod events;
pub mod ffmpeg_gate;
pub mod ffmpeg_run;
pub mod hls;
pub mod image;
pub mod llm;
pub mod logbuf;
pub mod loudness;
pub mod metadata;
pub mod metrics;
pub mod probe;
pub mod storyboard;
pub mod stream;
pub mod subtitles;
pub mod theme;
pub mod watch;
