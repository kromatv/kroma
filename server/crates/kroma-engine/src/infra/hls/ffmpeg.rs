//! The remux process: what is spawned, and the one probe that decides where it
//! starts. Everything here shells out; nothing here touches the session map.

use std::path::Path;
use std::process::Stdio;

use tokio::process::{Child, Command};

use super::naming::contains;
use super::{StreamMode, VideoMode};

const SEGMENT_SECONDS: &str = "6";
/// The write pattern handed to `-hls_segment_filename`; `naming::seg_index`
/// parses what it produces.
pub const SEGMENT_PATTERN: &str = "seg_%05d.m4s";
// Multiple of realtime ffmpeg may read at, so concurrent sessions don't
// thrash the mount; above 1.0 so clients can still build a forward buffer.
const READRATE: &str = "2.0";
// Seconds read at full speed before READRATE throttling starts (ffmpeg >= 6.1).
const READRATE_BURST: &str = "60";

/// `-readrate_initial_burst` only exists from ffmpeg 6.1; older builds get a
/// plain `-readrate` and a slightly slower first segment.
pub fn detect_burst() -> bool {
    std::process::Command::new("ffmpeg")
        .args(["-hide_banner", "-h", "full"])
        .output()
        .map(|o| {
            let mut s = o.stdout;
            s.extend_from_slice(&o.stderr);
            contains(&s, b"readrate_initial_burst")
        })
        .unwrap_or(false)
}

/// The keyframe at-or-before `anchor`, which is where the remux really starts
/// and what the client uses as `baseSec`.
pub async fn keyframe_before(input: &Path, anchor: f64) -> f64 {
    if anchor <= 0.5 {
        return 0.0;
    }
    let from = (anchor - 30.0).max(0.0);
    let out = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-skip_frame",
            "nokey",
        ])
        .arg("-read_intervals")
        .arg(format!("{from:.3}%{anchor:.3}"))
        .args(["-show_entries", "frame=pts_time", "-of", "csv=p=0"])
        .arg(input)
        .output()
        .await;
    let Ok(out) = out else {
        return anchor;
    };
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|l| l.trim().trim_end_matches(',').parse::<f64>().ok())
        .filter(|t| *t <= anchor + 0.01)
        .fold(None, |best: Option<f64>, t| {
            Some(best.map_or(t, |b| b.max(t)))
        })
        .unwrap_or(anchor)
}

// The selected audio track is MUXED into one media playlist rather than exposed as
// an alternate rendition: hls.js keeps playing rendition 0 regardless of selection.
// A language switch is therefore a reload with a different `audio` (a new session).
pub fn spawn_stream(
    input: &Path,
    dir: &Path,
    audio: u32,
    mode: StreamMode,
    start_secs: f64,
    burst: bool,
) -> std::io::Result<Child> {
    let seeking = start_secs > 0.5;
    let copying_video = matches!(mode.video, VideoMode::Copy);
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-v", "error", "-nostdin"]);
    // `-threads` lands on the DECODER here (before `-i`): a remux never decodes
    // video, so a pool is pure overhead - but a transcode does, and one thread
    // cannot keep a 4K source ahead of the player.
    if copying_video {
        cmd.args(["-threads", "1"]);
    }
    if seeking {
        // Required for A/V sync: an accurate seek backs the video to a keyframe but
        // decodes-and-discards audio to the exact `-ss`, starting it a GOP late.
        cmd.arg("-noaccurate_seek")
            .arg("-ss")
            .arg(format!("{start_secs:.3}"));
    }
    // Input option: must come before `-i`.
    cmd.args(["-readrate", READRATE]);
    if burst {
        cmd.args(["-readrate_initial_burst", READRATE_BURST]);
    }
    cmd.arg("-i").arg(input);
    if seeking {
        cmd.arg("-copyts"); // keep source timestamps so video + audio stay on one timeline
    }
    cmd.args(["-map", "0:v:0"])
        .arg("-map")
        .arg(format!("0:a:{audio}"));
    if copying_video {
        cmd.args(["-c:v", "copy"]);
    } else {
        // 8-bit H.264 because the fallback exists for decoders the source defeats,
        // so it must land on the one profile every target reads. HDR sources are
        // not tone-mapped (no zimg) and come out washed-out.
        cmd.args([
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
        ]);
    }
    if mode.audio.transcode() {
        if let Some(af) = mode.audio.filter_chain() {
            cmd.args(["-af", af]);
        }
        cmd.args(["-c:a", "aac", "-ac", "2", "-b:a", "192k"]);
    } else {
        cmd.args(["-c:a", "copy"]);
    }
    cmd.args(["-f", "hls", "-hls_time", SEGMENT_SECONDS])
        .args(["-hls_playlist_type", "event"])
        .args(["-hls_segment_type", "fmp4"])
        .args(["-hls_fmp4_init_filename", "init.mp4"])
        .arg("-hls_segment_filename")
        .arg(dir.join(SEGMENT_PATTERN))
        .args(["-hls_flags", "independent_segments+temp_file"])
        .arg(dir.join("index.m3u8"))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .kill_on_drop(true);
    match std::fs::File::create(dir.join("ffmpeg.log")) {
        Ok(f) => {
            cmd.stderr(Stdio::from(f));
        }
        Err(_) => {
            cmd.stderr(Stdio::null());
        }
    }
    cmd.spawn()
}
