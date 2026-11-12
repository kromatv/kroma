use std::path::Path;
use std::process::Command;

use kroma_media::input;

// 80/6 keeps posters crisp at a fraction of JPEG's size.
const WEBP_QUALITY: &str = "80";
const WEBP_EFFORT: &str = "6";

// cwebp has no "shrink only" flag: `-resize 1280 0` blows a 320px logo up to a
// blurry 1280. The source is measured first and resize only added when it
// would actually shrink. ffmpeg is the fallback (`min(iw,W)` expresses the
// same rule) since some ffmpeg builds lack the libwebp encoder.
pub(super) fn encode_webp_capped(src: &Path, out: &Path, max_width: u32) -> bool {
    // `is_some_and`, not `is_none_or`: an unreadable width must mean "do not
    // resize", never "resize anyway" (which would upscale).
    let too_wide = probe_width(src).is_some_and(|w| w > max_width);
    let mut cwebp = Command::new("cwebp");
    cwebp.args(["-quiet", "-q", WEBP_QUALITY, "-m", WEBP_EFFORT]);
    if too_wide {
        cwebp.args(["-resize", &max_width.to_string(), "0"]);
    }
    let status = cwebp.arg(src).arg("-o").arg(out).status();
    if matches!(status, Ok(s) if s.success()) && out.exists() {
        return true;
    }
    let _ = std::fs::remove_file(out);

    let shrink = format!("scale='min(iw,{max_width})':-2:flags=lanczos");
    if ffmpeg_webp(src, out, WEBP_QUALITY, Some(&shrink)) {
        return true;
    }
    let _ = std::fs::remove_file(out);
    false
}

pub(super) fn probe_width(src: &Path) -> Option<u32> {
    let out = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width",
            "-of",
            "csv=p=0",
        ])
        .args(input::file(src))
        .output()
        .ok()?;
    String::from_utf8_lossy(&out.stdout)
        .trim()
        .split(',')
        .next()?
        .parse()
        .ok()
}

pub(super) fn encode_webp(src: &Path, out: &Path) -> bool {
    encode_webp_quality(src, out, WEBP_QUALITY)
}

/// Prefers `cwebp`; falls back to ffmpeg's libwebp encoder. Shared with the
/// storyboard sheet, which wants a lower quality than posters.
pub(crate) fn encode_webp_quality(src: &Path, out: &Path, quality: &str) -> bool {
    let cwebp = Command::new("cwebp")
        .args(["-quiet", "-q", quality, "-m", WEBP_EFFORT])
        .arg(src)
        .arg("-o")
        .arg(out)
        .status();
    if matches!(cwebp, Ok(s) if s.success()) {
        return true;
    }

    ffmpeg_webp(src, out, quality, None)
}

fn ffmpeg_webp(src: &Path, out: &Path, quality: &str, vf: Option<&str>) -> bool {
    let mut ffmpeg = Command::new("ffmpeg");
    ffmpeg
        .args(["-y", "-loglevel", "error", "-threads", "1"])
        .args(input::file(src));
    if let Some(vf) = vf {
        ffmpeg.args(["-vf", vf]);
    }
    let status = ffmpeg
        .args(["-frames:v", "1", "-c:v", "libwebp", "-q:v", quality])
        .args(["-compression_level", WEBP_EFFORT])
        .arg(out)
        .status();
    matches!(status, Ok(s) if s.success()) && out.exists()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ffmpeg_encodes_at_the_quality_it_is_asked_for() {
        let dir = kroma_testing::temp_dir("image-quality");
        let src = dir.path().join("src.png");
        let low = dir.path().join("low.webp");
        let high = dir.path().join("high.webp");
        let drawn = Command::new("ffmpeg")
            .args(["-y", "-loglevel", "error"])
            .args(input::generated("testsrc2=size=320x180:rate=1"))
            .args(["-frames:v", "1"])
            .arg(&src)
            .status();
        if !matches!(drawn, Ok(s) if s.success()) || !ffmpeg_webp(&src, &low, "20", None) {
            return;
        }

        assert!(ffmpeg_webp(&src, &high, "90", None));

        let size = |p: &Path| std::fs::metadata(p).unwrap().len();
        assert!(size(&high) > size(&low));
    }
}
