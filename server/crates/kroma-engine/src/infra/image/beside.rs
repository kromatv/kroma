use std::path::Path;
use std::time::UNIX_EPOCH;

use kroma_media::tmp_file::unique_tmp;
use kroma_primitives::short_hash;

use super::encode::encode_webp_capped;
use super::scratch::finalize;

/// What the name of every cached picture kept in a media folder starts with.
pub const BESIDE_PREFIX: &str = "beside-";

/// The name a picture kept in a media folder is cached under. It follows the
/// picture's path, size and time of change, so an edited picture gets a new
/// name and an unchanged one keeps its own. `None` when the picture cannot be
/// read.
pub fn beside_name(picture: &Path) -> Option<String> {
    let meta = std::fs::metadata(picture).ok()?;
    let changed = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
    let key = format!(
        "{}|{}|{}",
        picture.display(),
        meta.len(),
        changed.as_nanos()
    );
    Some(format!("{BESIDE_PREFIX}{}.webp", short_hash(&key)))
}

/// Caches `picture` at `out` as a WebP no wider than `max_width`. Whether
/// `out` holds it now: false when the picture cannot be read or encoded.
pub fn cache_picture_beside(picture: &Path, out: &Path, max_width: u32) -> bool {
    if out.exists() {
        return true;
    }
    if !picture.is_file() {
        return false;
    }
    if let Some(dir) = out.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let tmp = unique_tmp(out);
    if !encode_webp_capped(picture, &tmp, max_width) {
        let _ = std::fs::remove_file(&tmp);
        return false;
    }
    finalize(&tmp, out).is_some()
}

#[cfg(test)]
mod tests;
