//! A real media file for the tests that read one. ffmpeg is what every pass in
//! this crate shells out to, so a path it cannot open proves nothing about the
//! code around it.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Five seconds of colour bars and a tone at `<dir>/clip.mp4`, keyframed every
/// second so a seek has somewhere to land.
pub(crate) fn clip(dir: &Path) -> PathBuf {
    let at = dir.join("clip.mp4");
    let status = Command::new("ffmpeg")
        .args(["-v", "error", "-nostdin", "-y"])
        .args(["-f", "lavfi", "-i", "testsrc=size=320x180:rate=15:duration=5"])
        .args(["-f", "lavfi", "-i", "sine=frequency=440:duration=5"])
        .args(["-c:v", "libx264", "-g", "15", "-pix_fmt", "yuv420p"])
        .args(["-c:a", "aac", "-shortest"])
        .arg(&at)
        .status()
        .expect("run ffmpeg");
    assert!(status.success(), "ffmpeg could not write the fixture clip");
    at
}
