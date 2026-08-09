//! Local WebP cache for remote (TMDB) artwork: downloaded once and transcoded
//! via `ffmpeg` into `<data>/images/`. Falls back to the original remote URL
//! if caching fails.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::model::Metadata;
use kroma_primitives::short_hash;

static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// Served by `GET /api/images/:name`.
pub const PUBLIC_PREFIX: &str = "/api/images/";

// 80/6 keeps posters crisp at a fraction of JPEG's size.
const WEBP_QUALITY: &str = "80";
const WEBP_EFFORT: &str = "6";

pub fn images_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("images")
}

/// Rewrites a [`Metadata`]'s poster/backdrop URLs to locally-cached WebP.
/// Leaves any image unchanged that can't be cached.
pub fn localize(data_dir: &Path, mut meta: Metadata) -> Metadata {
    if let Some(url) = meta.poster_url.as_deref() {
        if let Some(local) = cache(data_dir, url) {
            meta.poster_url = Some(local);
        }
    }
    if let Some(url) = meta.backdrop_url.as_deref() {
        if let Some(local) = cache(data_dir, url) {
            meta.backdrop_url = Some(local);
        }
    }
    // Logo kept as PNG, not transcoded: transparency must survive.
    if let Some(url) = meta.logo_url.as_deref() {
        if let Some(local) = cache_verbatim(data_dir, url, "png") {
            meta.logo_url = Some(local);
        }
    }
    for member in &mut meta.cast {
        if let Some(url) = member.profile_url.as_deref() {
            if let Some(local) = cache(data_dir, url) {
                member.profile_url = Some(local);
            }
        }
    }
    meta
}

fn cache_verbatim(data_dir: &Path, remote_url: &str, ext: &str) -> Option<String> {
    if !remote_url.starts_with("http") {
        return Some(remote_url.to_string());
    }
    let dir = images_dir(data_dir);
    std::fs::create_dir_all(&dir).ok()?;
    let name = format!("{}.{ext}", short_hash(remote_url));
    let out = dir.join(&name);
    if !out.exists() {
        let tmp = unique_tmp(&out);
        let dl = Command::new("curl")
            .args(["-sf", "-L", "--max-time", "25", "-o"])
            .arg(&tmp)
            .arg(remote_url)
            .status();
        if !matches!(dl, Ok(s) if s.success()) || !tmp.exists() {
            let _ = std::fs::remove_file(&tmp);
            return None;
        }
        finalize(&tmp, &out)?;
    }
    Some(format!("{PUBLIC_PREFIX}{name}"))
}

/// A title logo (alpha preserved), scaled to fit ≤300×120 (`scale` 1) or
/// ≤600×240 (`scale` 2, the Apple TV Top Shelf card) and cached as
/// `<name>.logo.png` / `<name>.logo2x.png`.
pub fn card_logo_png(data_dir: &Path, name: &str, scale: u32) -> Option<PathBuf> {
    let dir = images_dir(data_dir);
    let (w, h, sfx) = if scale >= 2 { (600, 240, "2x") } else { (300, 120, "") };
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
    let (w, h, sfx) = if scale >= 2 { (1280, 720, "2x") } else { (640, 360, "") };
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
        .args(["-y", "-loglevel", "error", "-threads", "1", "-i"])
        .arg(src)
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

// Keeps `out`'s extension so ffmpeg/cwebp still detect the output format.
fn unique_tmp(out: &Path) -> PathBuf {
    let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let base = out.file_name().and_then(|n| n.to_str()).unwrap_or("rendition");
    let ext = out.extension().and_then(|e| e.to_str()).unwrap_or("tmp");
    out.with_file_name(format!("{base}.{}.{seq}.tmp.{ext}", std::process::id()))
}

fn finalize(tmp: &Path, out: &Path) -> Option<PathBuf> {
    match std::fs::rename(tmp, out) {
        Ok(()) => Some(out.to_path_buf()),
        Err(_) => {
            let _ = std::fs::remove_file(tmp);
            None
        }
    }
}

/// Ensures a remote image is cached as WebP and returns its public path, or
/// `None` on failure (the caller keeps the provider URL). The entry point for
/// art that arrives outside title enrichment, e.g. a person's portrait.
pub fn cache_remote(data_dir: &Path, remote_url: &str) -> Option<String> {
    cache(data_dir, remote_url)
}

fn cache(data_dir: &Path, remote_url: &str) -> Option<String> {
    // Already a local path (idempotent if called twice).
    if !remote_url.starts_with("http") {
        return Some(remote_url.to_string());
    }
    let dir = images_dir(data_dir);
    std::fs::create_dir_all(&dir).ok()?;

    let name = format!("{}.webp", short_hash(remote_url));
    let out = dir.join(&name);
    if !out.exists() && !transcode(remote_url, &out) {
        return None;
    }
    Some(format!("{PUBLIC_PREFIX}{name}"))
}

/// Stores an uploaded image as a content-addressed WebP, returning its public
/// path. `max_width`, if given, caps the stored master in pixels (shrinking
/// only) so an oversized upload doesn't fill the cache with pixels nothing
/// ever draws. `name_prefix` namespaces the stored file inside the shared
/// image dir, so one caller's uploads can be listed apart from the rest.
pub fn store_upload(
    data_dir: &Path,
    bytes: &[u8],
    max_width: Option<u32>,
    name_prefix: &str,
) -> Option<String> {
    let dir = images_dir(data_dir);
    std::fs::create_dir_all(&dir).ok()?;

    // Hash covers the cap too: the same photo stored for two different caps
    // is two different images, so reusing one hash would serve the wrong crop.
    let name = match max_width {
        Some(w) => format!("{name_prefix}{}-w{w}.webp", content_hash(bytes)),
        None => format!("{name_prefix}{}.webp", content_hash(bytes)),
    };
    let out = dir.join(&name);
    if !out.exists() {
        // cwebp/ffmpeg read from disk, not stdin, so the raw bytes go to a temp
        // file first.
        let src_tmp = unique_tmp(&out);
        if std::fs::write(&src_tmp, bytes).is_err() {
            let _ = std::fs::remove_file(&src_tmp);
            return None;
        }
        let out_tmp = unique_tmp(&out);
        let ok = match max_width {
            Some(w) => encode_webp_capped(&src_tmp, &out_tmp, w),
            None => encode_webp(&src_tmp, &out_tmp),
        } && out_tmp.exists();
        let _ = std::fs::remove_file(&src_tmp);
        if !ok {
            let _ = std::fs::remove_file(&out_tmp);
            return None;
        }
        finalize(&out_tmp, &out)?;
    }
    Some(format!("{PUBLIC_PREFIX}{name}"))
}

// cwebp has no "shrink only" flag: `-resize 1280 0` blows a 320px logo up to a
// blurry 1280. The source is measured first and resize only added when it
// would actually shrink. ffmpeg is the fallback (`min(iw,W)` expresses the
// same rule) since some ffmpeg builds lack the libwebp encoder.
fn encode_webp_capped(src: &Path, out: &Path, max_width: u32) -> bool {
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

    let scaled = Command::new("ffmpeg")
        .args(["-y", "-loglevel", "error", "-threads", "1", "-i"])
        .arg(src)
        .args([
            "-vf",
            &format!("scale='min(iw,{max_width})':-2:flags=lanczos"),
            "-frames:v",
            "1",
            "-c:v",
            "libwebp",
            "-quality",
            WEBP_QUALITY,
            "-compression_level",
            WEBP_EFFORT,
        ])
        .arg(out)
        .status();
    if matches!(scaled, Ok(s) if s.success()) && out.exists() {
        return true;
    }
    let _ = std::fs::remove_file(out);
    false
}

fn probe_width(src: &Path) -> Option<u32> {
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
        .arg(src)
        .output()
        .ok()?;
    String::from_utf8_lossy(&out.stdout).trim().split(',').next()?.parse().ok()
}

fn content_hash(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(bytes);
    hex::encode(h.finalize())[..16].to_string()
}

fn transcode(remote_url: &str, out: &Path) -> bool {
    let src_tmp = unique_tmp(out);
    let dl = Command::new("curl")
        .args(["-sf", "-L", "--max-time", "25", "-o"])
        .arg(&src_tmp)
        .arg(remote_url)
        .status();
    if !matches!(dl, Ok(s) if s.success()) {
        let _ = std::fs::remove_file(&src_tmp);
        return false;
    }

    let out_tmp = unique_tmp(out);
    let ok = encode_webp(&src_tmp, &out_tmp) && out_tmp.exists();
    let _ = std::fs::remove_file(&src_tmp);
    if !ok {
        let _ = std::fs::remove_file(&out_tmp);
        return false;
    }
    finalize(&out_tmp, out).is_some()
}

fn encode_webp(src: &Path, out: &Path) -> bool {
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

    let ffmpeg = Command::new("ffmpeg")
        .args(["-y", "-loglevel", "error", "-threads", "1", "-i"])
        .arg(src)
        .args([
            "-frames:v",
            "1",
            "-c:v",
            "libwebp",
            "-quality",
            quality,
            "-compression_level",
            WEBP_EFFORT,
        ])
        .arg(out)
        .status();
    matches!(ffmpeg, Ok(s) if s.success())
}
