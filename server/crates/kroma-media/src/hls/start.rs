//! Where a session's stream begins on the film's clock: the probe that guesses
//! it before ffmpeg runs, and the read of what ffmpeg wrote.

use std::path::Path;
use std::sync::OnceLock;
use std::time::Duration;

use tokio::process::Command;
use tracing::info;

use crate::input;

const FIRST_FRAME_WAIT: Duration = Duration::from_secs(3);

/// The start a client adds its own clock to. The probe of the source guesses it
/// before ffmpeg has written anything; the first segment on disk settles it,
/// since ffmpeg's seek does not always land on the keyframe the probe's did.
pub(super) struct Start {
    probed: f64,
    written: OnceLock<f64>,
}

impl Start {
    pub(super) fn probed(secs: f64) -> Self {
        Self {
            probed: secs,
            written: OnceLock::new(),
        }
    }

    pub(super) fn settled(secs: f64) -> Self {
        Self {
            probed: secs,
            written: OnceLock::from(secs),
        }
    }

    pub(super) fn secs(&self) -> f64 {
        self.written.get().copied().unwrap_or(self.probed)
    }

    pub(super) async fn settle(&self, session: &str, dir: &Path) -> f64 {
        if let Some(secs) = self.written.get() {
            return *secs;
        }
        let Some(written) = first_frame(&dir.join("index.m3u8")).await else {
            return self.probed;
        };
        if (written - self.probed).abs() > 0.01 {
            info!(
                session,
                probed = self.probed,
                written,
                "the remux began elsewhere than probed"
            );
        }
        *self.written.get_or_init(|| written)
    }
}

/// Whether a remux from `anchor` seeks, rather than starting at the top of the
/// film, where nothing moves its start off zero.
pub fn seeks(anchor: f64) -> bool {
    anchor > 0.5
}

/// The keyframe the remux should start on for `anchor`, on the film's clock (the
/// file's timestamps less the one they begin at). The client takes it as
/// `baseSec` until [`first_frame`] can say where the remux really began. Falls
/// back to `anchor` itself where the container answers nothing.
///
/// Read as one frame FROM the anchor, not a scan of the window before it: the
/// demuxer's seek, counted like `-ss` from where the file's clock begins, is the
/// seek `-ss` will make, so the first frame handed back is the answer, and a scan
/// would demux every byte of that window instead.
pub async fn keyframe_before(input: &Path, anchor: f64) -> f64 {
    if !seeks(anchor) {
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
        .arg(format!("+{anchor:.3}%+#1"))
        .args(["-show_entries", "format=start_time:frame=pts_time"])
        .args(["-of", "csv=p=1"])
        .args(input::file(input))
        .output()
        .await;
    let Ok(out) = out else {
        return anchor;
    };
    let probed = String::from_utf8_lossy(&out.stdout);
    let field = |section: &str| {
        probed.lines().find_map(|line| {
            let value = line.strip_prefix(section)?.strip_prefix(',')?;
            value.trim().trim_end_matches(',').parse::<f64>().ok()
        })
    };
    match field("frame") {
        Some(frame) => frame - field("format").unwrap_or(0.0),
        None => anchor,
    }
}

/// The first video frame the session playlist at `playlist` holds, on the clock
/// ffmpeg wrote it on. `None` while no segment of it can be read.
pub async fn first_frame(playlist: &Path) -> Option<f64> {
    let out = tokio::time::timeout(
        FIRST_FRAME_WAIT,
        Command::new("ffprobe")
            .args(["-v", "error", "-live_start_index", "0"])
            .args(["-select_streams", "v:0", "-show_entries", "packet=pts_time"])
            .args(["-read_intervals", "%+#1"])
            .args(["-of", "csv=p=0"])
            .args(input::file(playlist))
            .kill_on_drop(true)
            .output(),
    )
    .await
    .ok()?
    .ok()?;
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .find_map(|line| line.trim().trim_end_matches(',').parse::<f64>().ok())
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn clip(dir: &Path) -> Option<PathBuf> {
        clip_clocked_from(dir, 0.0)
    }

    fn clip_clocked_from(dir: &Path, secs: f64) -> Option<PathBuf> {
        let path = dir.join("clip.mp4");
        std::process::Command::new("ffmpeg")
            .args(["-v", "error"])
            .args(input::generated("testsrc=duration=20:size=64x48:rate=25"))
            .args(["-c:v", "libx264", "-g", "50", "-y"])
            .arg("-output_ts_offset")
            .arg(secs.to_string())
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
    async fn a_file_whose_clock_starts_late_is_probed_on_the_film_s_own_clock() {
        let dir = kroma_testing::temp_dir("hls-keyframe-late");
        let Some(path) = clip_clocked_from(dir.path(), 8.7) else {
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
}
