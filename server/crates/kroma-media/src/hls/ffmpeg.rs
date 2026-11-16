//! The remux process: what is spawned. Everything here shells out; nothing here
//! touches the session map.

use std::path::Path;
use std::process::Stdio;

use tokio::process::{Child, Command};

use crate::input;

use super::hwaccel::Pipeline;
use super::naming::contains;
use super::start::seeks;
use super::{StreamMode, VideoMode};

const SEGMENT_SECONDS: u32 = 6;
/// The write pattern handed to `-hls_segment_filename`; `naming::seg_index`
/// parses what it produces.
pub const SEGMENT_PATTERN: &str = "seg_%05d.m4s";
// Multiple of realtime ffmpeg may read at, so concurrent sessions don't
// thrash the mount; above 1.0 so clients can still build a forward buffer.
const READRATE: &str = "2.0";
// Seconds read at full speed before READRATE throttling starts (ffmpeg >= 6.1).
const READRATE_BURST: &str = "60";

/// A keyframe every segment, counted from the first frame OUT rather than from
/// the source clock: a seek runs under `-copyts`, so an expression in absolute
/// time would force a keyframe on every frame until `n_forced * SEGMENT_SECONDS`
/// caught up with the anchor.
///
/// Left alone, the encoder keys on its own schedule (~10 s at libx264's default
/// keyint) and the HLS muxer can only cut where it finds one, so segments run
/// half again as long as the playlist asks for and the first one costs that much
/// media before anything can be played.
fn keyframe_cadence() -> String {
    format!("expr:if(isnan(prev_forced_t),1,gte(t,prev_forced_t+{SEGMENT_SECONDS}))")
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
    let seeking = seeks(start_secs);
    let copying_video = matches!(mode.video, VideoMode::Copy);
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
    cmd.args(input::file(input));
    if seeking {
        cmd.args(["-copyts", "-start_at_zero"]); // keep source timestamps so video + audio stay on one timeline
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
        cmd.arg("-force_key_frames").arg(keyframe_cadence());
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
    let hls_time = SEGMENT_SECONDS.to_string();
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

    #[test]
    fn the_keyframe_cadence_is_measured_from_the_first_frame_out() {
        let expr = keyframe_cadence();

        assert!(expr.contains("prev_forced_t"), "{expr}");
        assert!(expr.contains("isnan"), "{expr}");
        // Never `n_forced * 6`: under `-copyts` a seek starts the output at the
        // anchor, and an expression in absolute time forces a keyframe on every
        // frame until the count has caught up with it.
        assert!(!expr.contains("n_forced"), "{expr}");
    }

    #[test]
    fn a_keyframe_lands_on_every_segment_boundary() {
        assert!(keyframe_cadence().contains(&format!("+{SEGMENT_SECONDS})")));
    }
}
