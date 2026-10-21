use std::path::Path;

use super::encode::{encode_webp, encode_webp_capped};
use super::scratch::{finalize, unique_tmp};
use super::{images_dir, PUBLIC_PREFIX};

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

fn content_hash(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(bytes);
    hex::encode(h.finalize())[..16].to_string()
}
