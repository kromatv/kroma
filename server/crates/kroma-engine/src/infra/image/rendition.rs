use std::path::{Path, PathBuf};
use std::process::Command;

use kroma_media::input;

use super::encode::probe_width;
use super::images_dir;
use super::scratch::{finalize, unique_tmp};

/// A title logo (alpha preserved), scaled to fit ≤300×120 (`scale` 1) or
/// ≤600×240 (`scale` 2, the Apple TV Top Shelf card) and cached as
/// `<name>.logo.png` / `<name>.logo2x.png`.
pub fn card_logo_png(data_dir: &Path, name: &str, scale: u32) -> Option<PathBuf> {
    let dir = images_dir(data_dir);
    let (w, h, sfx) = if scale >= 2 {
        (600, 240, "2x")
    } else {
        (300, 120, "")
    };
    ffmpeg_rendition(
        &dir.join(name),
        &dir.join(format!("{name}.logo{sfx}.png")),
        &format!("scale={w}:{h}:force_original_aspect_ratio=decrease"),
        &[],
    )
}

/// 16:9 cover-fit PNG of a cached WebP (tiny-skia decodes PNG, not WebP):
/// 640×360 at `scale` 1 (Smart Hub tiles), 1280×720 at `scale` 2 (Apple TV Top
/// Shelf). Cached as `<hash>.webp.card.png` / `<hash>.webp.card2x.png`.
pub fn card_base_png(data_dir: &Path, webp_name: &str, scale: u32) -> Option<PathBuf> {
    let dir = images_dir(data_dir);
    let (w, h, sfx) = if scale >= 2 {
        (1280, 720, "2x")
    } else {
        (640, 360, "")
    };
    ffmpeg_rendition(
        &dir.join(webp_name),
        &dir.join(format!("{webp_name}.card{sfx}.png")),
        &format!("scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}"),
        &[],
    )
}

/// JPEG rendition of a cached WebP, scaled to 360px tall: Samsung TV Smart Hub
/// preview tiles accept only PNG/JPG, max 360 KB, height ≤360px.
pub fn jpeg_rendition(data_dir: &Path, webp_name: &str) -> Option<PathBuf> {
    let dir = images_dir(data_dir);
    ffmpeg_rendition(
        &dir.join(webp_name),
        &dir.join(format!("{webp_name}.jpg")),
        "scale=-2:360:flags=lanczos",
        &["-q:v", "3"],
    )
}

/// Downscaled rendition of a cached image, for the `?w=` query on
/// `GET /api/images/:name`. Encoded by `cwebp -resize` when available, else
/// ffmpeg → JPEG (many ffmpeg builds lack a WebP encoder but all have mjpeg).
pub fn sized_rendition(data_dir: &Path, name: &str, width: u32) -> Option<(PathBuf, &'static str)> {
    let dir = images_dir(data_dir);
    let src = dir.join(name);
    if !src.exists() {
        return None;
    }
    let webp_out = dir.join(format!("{name}.w{width}.webp"));
    if webp_out.exists() {
        return Some((webp_out, "image/webp"));
    }
    let jpg_out = dir.join(format!("{name}.w{width}.jpg"));
    if jpg_out.exists() {
        return Some((jpg_out, "image/jpeg"));
    }

    // `cwebp -resize` has no shrink-only mode, so a master already narrower than
    // the ask would come back UPSCALED: more bytes than the original, for fewer
    // pixels of detail. Posters arrive from TMDB at w500 and the widest bucket is
    // wider than that. A failed probe falls through and resizes as before.
    if probe_width(&src).is_some_and(|w| w <= width) {
        return None;
    }

    let tmp = unique_tmp(&webp_out);
    let cwebp = Command::new("cwebp")
        .args(["-quiet", "-q", "82", "-resize", &width.to_string(), "0"])
        .arg(&src)
        .arg("-o")
        .arg(&tmp)
        .status();
    if matches!(cwebp, Ok(s) if s.success()) && tmp.exists() {
        if let Some(p) = finalize(&tmp, &webp_out) {
            return Some((p, "image/webp"));
        }
    }
    let _ = std::fs::remove_file(&tmp);

    ffmpeg_rendition(
        &src,
        &jpg_out,
        &format!("scale='min(iw,{width})':-2:flags=lanczos"),
        &["-q:v", "4"],
    )
    .map(|p| (p, "image/jpeg"))
}

// Written to a unique temp then renamed atomically, so a concurrent reader
// checking `out.exists()` never observes a half-written file (which would be
// served 200 + immutable cache-control).
fn ffmpeg_rendition(src: &Path, out: &Path, vf: &str, extra: &[&str]) -> Option<PathBuf> {
    if !src.exists() {
        return None;
    }
    if out.exists() {
        return Some(out.to_path_buf());
    }
    let tmp = unique_tmp(out);
    let ok = Command::new("ffmpeg")
        .args(["-y", "-loglevel", "error", "-threads", "1"])
        .args(input::file(src))
        .args(["-vf", vf, "-frames:v", "1"])
        .args(extra)
        .arg(&tmp)
        .status();
    if !matches!(ok, Ok(s) if s.success()) || !tmp.exists() {
        let _ = std::fs::remove_file(&tmp);
        return None;
    }
    finalize(&tmp, out)
}
