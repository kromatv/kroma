use std::path::Path;
use std::process::Command;
use std::time::Duration;

use crate::ffmpeg_run::run_capturing;

use super::tile::TILE_PATTERN;
use super::Plan;

const TIMEOUT: Duration = Duration::from_secs(600);
const JPEG_QUALITY: &str = "12";

/// One image out of the `px_<NNNN>.png` tiles in `scratch`, laid out as the
/// plan's grid. The format is whatever `out`'s extension names.
pub fn montage(scratch: &Path, plan: &Plan, out: &Path) -> Result<(), String> {
    let mut cmd = Command::new("ffmpeg");
    cmd.args([
        "-v",
        "error",
        "-nostdin",
        "-threads",
        "1",
        "-y",
        "-start_number",
        "0",
        "-i",
    ])
    .arg(scratch.join(TILE_PATTERN))
    .args([
        "-frames:v",
        "1",
        "-vf",
        &format!("tile={}x{}", plan.cols, plan.rows),
    ])
    .arg(out);
    run_capturing(cmd, TIMEOUT).map_err(|e| format!("mosaic assembly failed: {e}"))?;
    match out.exists() {
        true => Ok(()),
        false => Err("mosaic assembly reported success but produced no sheet".to_string()),
    }
}

/// `src` re-encoded as JPEG, for a box with no WebP encoder and for a caller
/// that wants one sheet in one pass.
pub fn encode_jpeg(src: &Path, out: &Path) -> Result<(), String> {
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-y", "-v", "error", "-threads", "1", "-i"])
        .arg(src)
        .args(["-c:v", "mjpeg", "-q:v", JPEG_QUALITY, "-huffman", "optimal"])
        .arg(out);
    run_capturing(cmd, TIMEOUT)
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::path::PathBuf;

    use crate::storyboard::{grab_tiles, Decode};

    use super::super::tile::name_of;

    fn ten_bit_clip(dir: &Path) -> Option<PathBuf> {
        let clip = dir.join("clip.mp4");
        let made = Command::new("ffmpeg")
            .args(["-v", "error", "-y", "-f", "lavfi", "-i"])
            .arg("testsrc=size=320x180:rate=10:duration=1")
            .args(["-c:v", "libx264", "-pix_fmt", "yuv420p10le"])
            .arg(&clip)
            .status()
            .ok()?;
        made.success().then_some(clip)
    }

    fn brightest(image: &Path) -> u8 {
        let read = Command::new("ffmpeg")
            .args(["-v", "error", "-i"])
            .arg(image)
            .args(["-f", "rawvideo", "-pix_fmt", "gray", "-"])
            .output()
            .expect("ffmpeg reads back what it wrote");
        read.stdout.into_iter().max().unwrap_or(0)
    }

    fn depth_of(image: &Path) -> String {
        let read = Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-show_entries",
                "stream=pix_fmt",
                "-of",
                "csv=p=0",
            ])
            .arg(image)
            .output()
            .expect("ffprobe reads what ffmpeg wrote");
        String::from_utf8_lossy(&read.stdout).trim().to_string()
    }

    #[test]
    fn a_ten_bit_film_is_tiled_at_the_depth_every_other_source_is() {
        let dir = kroma_testing::temp_dir("sheet-grid");
        let Some(clip) = ten_bit_clip(dir.path()) else {
            return;
        };
        let tiles = dir.path().join("tiles");
        std::fs::create_dir_all(&tiles).unwrap();
        let plan = Plan::for_duration(660.0);
        let drawn = grab_tiles(
            &clip.to_string_lossy(),
            &tiles,
            &plan,
            &[0],
            Decode::Frames,
            &|| false,
        );
        if drawn.is_err() {
            return;
        }
        for cell in 1..plan.count {
            std::fs::copy(tiles.join(name_of(0)), tiles.join(name_of(cell))).unwrap();
        }
        let mosaic = dir.path().join("mosaic.png");
        let sheet = dir.path().join("sheet.jpg");

        montage(&tiles, &plan, &mosaic).unwrap();
        encode_jpeg(&mosaic, &sheet).unwrap();

        assert_eq!(depth_of(&tiles.join(name_of(0))), "rgb24");
        assert!(brightest(&tiles.join(name_of(0))) > 16, "the tile is black");
        assert!(brightest(&sheet) > 16, "the sheet is black");
    }
}
