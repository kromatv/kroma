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
            item_id: super::program_of(key).map_or_else(|| key.to_owned(), |(id, _)| id.to_owned()),
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
            plans.into_iter().map(|(plan, dir, running)| report(&plan, &dir, running)).collect()
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
mod tests {
    use super::super::hwaccel::HwAccel;
    use super::super::software::Effort;
    use super::super::Rung;
    use super::*;

    fn plan(key: &str, mode: StreamMode, accel: HwAccel) -> Plan {
        Plan::new(
            key,
            1,
            mode,
            Pipeline {
                accel,
                effort: Effort::Realtime,
            },
            Some((3840, 2160)),
            Some(4242),
            30.0,
        )
    }

    fn seeded_dir(name: &str) -> (kroma_testing::TempDir, std::path::PathBuf) {
        let data = kroma_testing::temp_dir(name);
        let dir = data.path().join("s");
        std::fs::create_dir_all(&dir).expect("session dir");
        (data, dir)
    }

    #[test]
    fn a_downscale_reports_the_box_it_is_fitting_the_picture_into() {
        let (_data, dir) = seeded_dir("hls-live-box");
        let mode = StreamMode::new(VideoMode::H264At(Rung::P1080), AudioMode::Aac);

        let t = report(&plan("it1:h264-1080-aac:30:a1", mode, HwAccel::Vaapi), &dir, true);

        assert_eq!(t.video, "h264-1080");
        assert_eq!((t.target_width, t.target_height), (Some(1920), Some(1080)));
        assert_eq!((t.source_width, t.source_height), (Some(3840), Some(2160)));
        assert!(t.transcodes_video);
        assert!(t.transcodes_audio);
        assert_eq!(t.accel, "vaapi");
        assert!(!t.on_the_cpu);
        assert_eq!(t.item_id, "it1");
        assert_eq!(t.pid, Some(4242));
    }

    #[test]
    fn a_stream_copy_says_it_is_costing_the_box_nothing() {
        let (_data, dir) = seeded_dir("hls-live-copy");
        let mode = StreamMode::new(VideoMode::Copy, AudioMode::Copy);

        let t = report(&plan("it1:copy:0:a1", mode, HwAccel::Software), &dir, true);

        assert_eq!(t.video, "copy");
        assert!(!t.transcodes_video);
        assert!(!t.transcodes_audio);
        assert_eq!((t.target_width, t.target_height), (None, None));
        assert!(t.on_the_cpu, "software is the pipeline even where nothing re-encodes");
    }

    #[test]
    fn the_rate_the_encoder_is_holding_comes_from_the_progress_file() {
        let (_data, dir) = seeded_dir("hls-live-speed");
        std::fs::write(
            dir.join(progress::FILE),
            "frame=300\nfps=25.00\nout_time_us=12000000\ndrop_frames=2\n\
             speed=0.42x\nprogress=continue\n",
        )
        .expect("progress file");

        let mode = StreamMode::new(VideoMode::H264, AudioMode::Aac);
        let t = report(&plan("it1:h264-aac:0:a1", mode, HwAccel::Software), &dir, true);

        assert!((t.speed - 0.42).abs() < 1e-3, "the box is losing to the film");
        assert_eq!(t.frames, 300);
        assert_eq!(t.dropped, 2);
        assert_eq!(t.out_time_ms, 12_000);
    }

    #[test]
    fn a_session_with_no_progress_file_yet_reports_zeroes_rather_than_nothing() {
        let (_data, dir) = seeded_dir("hls-live-early");
        let mode = StreamMode::new(VideoMode::H264, AudioMode::Copy);

        let t = report(&plan("it1:h264-copy:0:a1", mode, HwAccel::Software), &dir, true);

        assert_eq!(t.speed, 0.0);
        assert_eq!(t.segments, 0);
        assert!(t.running);
    }

    #[test]
    fn segments_are_counted_apart_from_everything_else_in_the_directory() {
        let (_data, dir) = seeded_dir("hls-live-stats");
        for name in ["seg_00001.m4s", "seg_00002.m4s", "init.mp4", "index.m3u8"] {
            std::fs::write(dir.join(name), vec![b'x'; 100]).expect("file");
        }

        let (segments, bytes) = dir_stats(&dir);

        assert_eq!(segments, 2);
        assert_eq!(bytes, 400, "every file counts toward the disk it is holding");
    }

    #[test]
    fn a_finished_run_stops_reading_as_running() {
        let (_data, dir) = seeded_dir("hls-live-done");
        std::fs::write(dir.join(progress::FILE), "frame=9\nspeed=2.0x\nprogress=end\n")
            .expect("progress file");

        let mode = StreamMode::new(VideoMode::Copy, AudioMode::Aac);
        let t = report(&plan("it1:aac:0:a1", mode, HwAccel::Software), &dir, true);

        assert!(!t.running);
    }
}
