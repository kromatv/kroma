//! The remux process: what is spawned, and the one probe that decides where it
//! starts. Everything here shells out; nothing here touches the session map.

use std::path::Path;
use std::process::Stdio;

#[cfg(test)]
use std::path::PathBuf;

use tokio::process::{Child, Command};

use super::hwaccel::Pipeline;
use super::naming::contains;
use super::{StreamMode, VideoMode};

const SEGMENT_SECONDS: u32 = 6;
// An input read over HTTP arrives at the network's pace rather than the disk's,
// and nothing plays until the first segment is written: that is this many seconds
// of media fetched before the first frame. A stream copy still cuts on a source
// keyframe, so asking for less can only bring the first cut forward.
const ARRIVING_SEGMENT_SECONDS: u32 = 2;
/// The write pattern handed to `-hls_segment_filename`; `naming::seg_index`
/// parses what it produces.
pub const SEGMENT_PATTERN: &str = "seg_%05d.m4s";
// Multiple of realtime ffmpeg may read at, so concurrent sessions don't
// thrash the mount; above 1.0 so clients can still build a forward buffer.
const READRATE: &str = "2.0";
// Seconds read at full speed before READRATE throttling starts (ffmpeg >= 6.1).
const READRATE_BURST: &str = "60";

pub(super) fn arriving_over_http(input: &Path) -> bool {
    input
        .to_str()
        .is_some_and(|i| i.starts_with("http://") || i.starts_with("https://"))
}

fn segment_seconds(input: &Path) -> u32 {
    if arriving_over_http(input) {
        ARRIVING_SEGMENT_SECONDS
    } else {
        SEGMENT_SECONDS
    }
}

/// A keyframe every segment, counted from the first frame OUT rather than from
/// the source clock: a seek runs under `-copyts`, so an expression in absolute
/// time would force a keyframe on every frame until `n_forced * seconds` caught
/// up with the anchor.
///
/// Left alone, the encoder keys on its own schedule (~10 s at libx264's default
/// keyint) and the HLS muxer can only cut where it finds one, so segments run
/// half again as long as the playlist asks for and the first one costs that much
/// media before anything can be played.
fn keyframe_cadence(seconds: u32) -> String {
    format!("expr:if(isnan(prev_forced_t),1,gte(t,prev_forced_t+{seconds}))")
}

/// What `ffmpeg <args>` printed, both streams together because which one carries
/// the answer varies by build. Empty where ffmpeg could not be run at all.
pub(super) fn ffmpeg_output(args: &[&str]) -> Vec<u8> {
    std::process::Command::new("ffmpeg")
        .args(args)
        .output()
        .map(|o| {
            let mut s = o.stdout;
            s.extend_from_slice(&o.stderr);
            s
        })
        .unwrap_or_default()
}

/// `-readrate_initial_burst` only exists from ffmpeg 6.1; older builds get a
/// plain `-readrate` and a slightly slower first segment.
pub fn detect_burst() -> bool {
    contains(
        &ffmpeg_output(&["-hide_banner", "-h", "full"]),
        b"readrate_initial_burst",
    )
}

/// The keyframe at-or-before `anchor`, which is where the remux really starts
/// and what the client uses as `baseSec`. Falls back to `anchor` itself where
/// the container answers nothing.
///
/// Read as one frame FROM the anchor, not a scan of the window before it: the
/// demuxer's seek is the seek `-ss` will make, so the first frame handed back is
/// the answer, and a scan would demux every byte of that window instead.
pub async fn keyframe_before(input: &Path, anchor: f64) -> f64 {
    if anchor <= 0.5 {
        return 0.0;
    }
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
        .arg(format!("{anchor:.3}%+#1"))
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
    pipeline: Pipeline,
) -> std::io::Result<Child> {
    let seeking = start_secs > 0.5;
    let copying_video = matches!(mode.video, VideoMode::Copy);
    let segment_seconds = segment_seconds(input);
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-v", "error", "-nostdin"]);
    // `-threads` lands on the DECODER here (before `-i`): a remux never decodes
    // video, so a pool is pure overhead - but a transcode does, and one thread
    // cannot keep a 4K source ahead of the player.
    if copying_video {
        cmd.args(["-threads", "1"]);
    } else {
        // Puts the decode on the device too where there is one, so a 4K source
        // never touches the CPU on its way to a 1080p screen.
        cmd.args(pipeline.accel.input_args(pipeline.effort));
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
        // The picture only shrinks when the client said its decoder needs it to;
        // the filter runs in whatever memory the device decoded into.
        if let Some(filter) = pipeline
            .accel
            .video_filter(mode.video.box_size(), pipeline.effort)
        {
            cmd.arg("-vf").arg(filter);
        }
        // 8-bit H.264 whatever the device, because the re-encode exists for
        // decoders the source defeats and must land on the one profile every
        // target reads. HDR sources are not tone-mapped (no zimg) and come out
        // washed-out.
        cmd.args(pipeline.accel.encoder_args(pipeline.effort));
        cmd.arg("-force_key_frames")
            .arg(keyframe_cadence(segment_seconds));
    }
    if mode.audio.transcode() {
        if let Some(af) = mode.audio.filter_chain() {
            cmd.args(["-af", af]);
        }
        cmd.args(["-c:a", "aac", "-ac", "2", "-b:a", "192k"]);
    } else {
        cmd.args(["-c:a", "copy"]);
    }
    // A second is fine-grained enough for a dashboard and cheap enough that a
    // two-hour session's log is about a megabyte, inside the directory the
    // reclaim sweep takes away with the rest of it.
    cmd.arg("-progress")
        .arg(dir.join(super::progress::FILE))
        .args(["-stats_period", "1"]);
    let hls_time = segment_seconds.to_string();
    cmd.args(["-f", "hls", "-hls_time", hls_time.as_str()])
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

#[cfg(test)]
mod tests {
    use super::*;

    fn clip(dir: &Path) -> Option<PathBuf> {
        let path = dir.join("clip.mp4");
        std::process::Command::new("ffmpeg")
            .args(["-v", "error", "-f", "lavfi", "-i"])
            .arg("testsrc=duration=20:size=64x48:rate=25")
            .args(["-c:v", "libx264", "-g", "50", "-y"])
            .arg(&path)
            .status()
            .ok()?
            .success()
            .then_some(path)
    }

    #[tokio::test]
    async fn a_seek_starts_on_the_keyframe_at_or_before_the_second_asked_for() {
        let dir = kroma_testing::temp_dir("hls-keyframe");
        let Some(path) = clip(dir.path()) else {
            return;
        };

        let start = keyframe_before(&path, 11.0).await;

        assert!((start - 10.0).abs() < 0.05, "{start}");
    }

    #[tokio::test]
    async fn a_second_the_container_cannot_answer_for_keeps_the_anchor() {
        let start = keyframe_before(Path::new("http://127.0.0.1:1/clip.mp4"), 42.0).await;

        assert_eq!(start, 42.0);
    }

    #[test]
    fn the_keyframe_cadence_is_measured_from_the_first_frame_out() {
        let expr = keyframe_cadence(SEGMENT_SECONDS);

        assert!(expr.contains("prev_forced_t"), "{expr}");
        assert!(expr.contains("isnan"), "{expr}");
        // Never `n_forced * 6`: under `-copyts` a seek starts the output at the
        // anchor, and an expression in absolute time forces a keyframe on every
        // frame until the count has caught up with it.
        assert!(!expr.contains("n_forced"), "{expr}");
    }

    #[test]
    fn a_keyframe_lands_on_every_segment_boundary() {
        assert!(keyframe_cadence(SEGMENT_SECONDS).contains(&format!("+{SEGMENT_SECONDS})")));
        assert!(keyframe_cadence(2).contains("+2)"));
    }

    #[test]
    fn a_stream_still_arriving_is_cut_sooner_than_one_read_off_a_disk() {
        let arriving = Path::new("http://127.0.0.1:4041/api/module/tv.x/play/abc");
        let on_disk = Path::new("/media/Dune (2021)/dune.mkv");

        assert!(segment_seconds(arriving) < segment_seconds(on_disk));
        assert_eq!(segment_seconds(on_disk), SEGMENT_SECONDS);
    }
}
