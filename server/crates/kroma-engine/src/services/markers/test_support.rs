use std::path::{Path, PathBuf};
use std::process::Command;

use crate::services::markers::video::{HEIGHT, WIDTH};

const EVERY_FRAME_A_KEYFRAME: [&str; 2] = ["-g", "1"];

fn render(at: &Path, source: &str) -> PathBuf {
    let status = Command::new("ffmpeg")
        .args(["-v", "error", "-nostdin", "-y"])
        .args(["-f", "lavfi", "-i", source])
        .args(["-c:v", "libx264", "-pix_fmt", "yuv420p"])
        .args(EVERY_FRAME_A_KEYFRAME)
        .arg(at)
        .status()
        .expect("run ffmpeg");
    assert!(status.success(), "ffmpeg could not write {}", at.display());
    at.to_path_buf()
}

/// `seconds` of colour bars: a picture, never credits.
pub(super) fn scene_clip(dir: &Path, seconds: u32) -> PathBuf {
    render(
        &dir.join("scene.mp4"),
        &format!("testsrc=size={WIDTH}x{HEIGHT}:rate=1:duration={seconds}"),
    )
}

/// `seconds` of rolling credits: dark, with a dense grid where the small text
/// would be. Rendered at the size the scan decodes to, so the grid survives the
/// scale rather than averaging into grey.
pub(super) fn credits_clip(dir: &Path, seconds: u32) -> PathBuf {
    render(
        &dir.join("credits.mp4"),
        &format!(
            "color=c=black:s={WIDTH}x{HEIGHT}:r=1:d={seconds},drawgrid=w=8:h=8:t=1:c=white"
        ),
    )
}
