//! What the box is spending its cycles on, as the admin sees it.
//!
//! A remux is invisible from outside the process: it is a child ffmpeg, so the
//! server's own CPU line stays flat while the machine sits at 100%, and nothing
//! anywhere says which title caused it, on what silicon, or whether the encoder
//! is keeping up. [`Transcode`] is that answer, one row per live session.
//!
//! [`Transcode::speed`] is the figure to read first. `-readrate` caps a healthy
//! session at the read rate; anything under 1.0x means the encoder is producing
//! less than a second of film per second and the player will run dry.

use std::path::Path;

use serde::Serialize;

use super::hwaccel::Pipeline;
use super::key::program_of;
use super::naming::seg_index;
use super::session::Sessions;
use super::{progress, AudioMode, StreamMode, VideoMode};

/// How one session was started. Carried on the session so a report never has to
/// re-derive it from the key.
#[derive(Clone)]
pub(super) struct Plan {
    key: String,
    item_id: String,
    audio_track: u32,
    mode: StreamMode,
    pipeline: Pipeline,
    source: Option<(u32, u32)>,
    pid: Option<u32>,
    anchor_secs: f64,
    started_at: i64,
}

impl Plan {
    pub(super) fn new(
        key: &str,
        audio_track: u32,
        mode: StreamMode,
        pipeline: Pipeline,
        source: Option<(u32, u32)>,
        pid: Option<u32>,
        anchor_secs: f64,
    ) -> Self {
        Plan {
            key: key.to_owned(),
            item_id: program_of(key).map_or_else(|| key.to_owned(), |(id, _)| id.to_owned()),
            audio_track,
            mode,
            pipeline,
            source,
            pid,
            anchor_secs,
            started_at: time::OffsetDateTime::now_utc().unix_timestamp(),
        }
    }
}

/// One live remux: what it is producing, what it is producing it on, and whether
/// it is keeping ahead of the player.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcode {
    pub id: String,
    pub item_id: String,
    pub audio_track: u32,
    /// `copy` | `h264` | `h264-1080` | `h264-720`.
    pub video: String,
    /// `copy` | `aac` | `aac-standard` | `aac-night`.
    pub audio: String,
    /// Whether the picture is being re-encoded, which is the expensive axis.
    pub transcodes_video: bool,
    pub transcodes_audio: bool,
    /// `videotoolbox` | `qsv` | `vaapi` | `nvenc` | `software`.
    pub accel: String,
    /// `quality` | `realtime`; only means anything on the software path.
    pub effort: String,
    /// True where the frames are rebuilt by the CPU rather than by a device.
    pub on_the_cpu: bool,
    /// The ffmpeg child, so a caller can attribute its CPU and memory.
    pub pid: Option<u32>,
    pub source_width: Option<u32>,
    pub source_height: Option<u32>,
    pub target_width: Option<u32>,
    pub target_height: Option<u32>,
    pub anchor_secs: f64,
    /// Unix seconds, server clock.
    pub started_at: i64,
    /// Multiple of realtime. Under 1.0 the encoder is losing to the film.
    pub speed: f32,
    pub fps: f32,
    pub frames: u64,
    pub dropped: u64,
    /// How far into the program ffmpeg has produced, in ms of media.
    pub out_time_ms: u64,
    pub segments: u64,
    pub bytes: u64,
    /// False once ffmpeg has exited, which for a whole film means it finished.
    pub running: bool,
}

impl Sessions {
    /// Every session that has not been reclaimed yet, newest first. The disk
    /// reads run off the reactor: this is polled by the admin dashboard.
    pub async fn live(&self) -> Vec<Transcode> {
        let mut plans = Vec::new();
        {
            let map = self.inner.lock().await;
            for session in map.values() {
                plans.push((
                    session.plan.clone(),
                    session.dir.clone(),
                    !session.finished().await,
                ));
            }
        }
        let mut out: Vec<Transcode> = tokio::task::spawn_blocking(move || {
            plans
                .into_iter()
                .map(|(plan, dir, running)| report(&plan, &dir, running))
                .collect()
        })
        .await
        .unwrap_or_default();
        out.sort_by_key(|t| std::cmp::Reverse(t.started_at));
        out
    }
}

fn report(plan: &Plan, dir: &Path, running: bool) -> Transcode {
    let p = progress::read(dir).unwrap_or_default();
    let (segments, bytes) = dir_stats(dir);
    let (target_width, target_height) = split(plan.mode.video.box_size());
    let (source_width, source_height) = split(plan.source);
    Transcode {
        id: plan.key.clone(),
        item_id: plan.item_id.clone(),
        audio_track: plan.audio_track,
        video: video_label(plan.mode.video).to_owned(),
        audio: audio_label(plan.mode.audio).to_owned(),
        transcodes_video: !matches!(plan.mode.video, VideoMode::Copy),
        transcodes_audio: !matches!(plan.mode.audio, AudioMode::Copy),
        accel: plan.pipeline.accel.label().to_owned(),
        effort: plan.pipeline.effort.label().to_owned(),
        on_the_cpu: plan.pipeline.on_the_cpu(),
        pid: plan.pid,
        source_width,
        source_height,
        target_width,
        target_height,
        anchor_secs: plan.anchor_secs,
        started_at: plan.started_at,
        speed: p.speed,
        fps: p.fps,
        frames: p.frames,
        dropped: p.dropped,
        out_time_ms: p.out_time_ms,
        segments,
        bytes,
        running: running && !p.ended,
    }
}

const fn split(size: Option<(u32, u32)>) -> (Option<u32>, Option<u32>) {
    match size {
        Some((w, h)) => (Some(w), Some(h)),
        None => (None, None),
    }
}

const fn video_label(video: VideoMode) -> &'static str {
    match video {
        VideoMode::Copy => "copy",
        VideoMode::H264 => "h264",
        VideoMode::H264At(rung) => rung.label(),
    }
}

const fn audio_label(audio: AudioMode) -> &'static str {
    match audio {
        AudioMode::Copy => "copy",
        AudioMode::Aac => "aac",
        AudioMode::AacStandard => "aac-standard",
        AudioMode::AacNight => "aac-night",
    }
}

// One pass for both figures: the admin polls this every few seconds and a long
// session's directory holds hundreds of entries.
fn dir_stats(dir: &Path) -> (u64, u64) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return (0, 0);
    };
    let mut segments = 0;
    let mut bytes = 0;
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_file() {
            continue;
        }
        bytes += meta.len();
        if entry.file_name().to_str().and_then(seg_index).is_some() {
            segments += 1;
        }
    }
    (segments, bytes)
}

#[cfg(test)]
mod tests;
