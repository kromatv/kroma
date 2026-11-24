use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use kroma_media::tmp_file::unique_tmp;
use kroma_primitives::short_hash;

use super::encode::encode_webp_capped;
use super::images_dir;
use super::scratch::finalize;

/// Caches a picture kept in a media folder as a WebP no wider than `max_width`
/// and returns the cached file. The name follows the picture's path, size and
/// time of change, so an edited picture is read again and an unchanged one is
/// never encoded twice. `None` when the picture cannot be read or encoded.
pub fn cache_picture_beside(data_dir: &Path, picture: &Path, max_width: u32) -> Option<PathBuf> {
    let meta = std::fs::metadata(picture).ok()?;
    let changed = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
    let key = format!(
        "{}|{}|{}",
        picture.display(),
        meta.len(),
        changed.as_nanos()
    );
    let dir = images_dir(data_dir);
    std::fs::create_dir_all(&dir).ok()?;
    let out = dir.join(format!("beside-{}.webp", short_hash(&key)));
    if out.exists() {
        return Some(out);
    }
    let tmp = unique_tmp(&out);
    if !encode_webp_capped(picture, &tmp, max_width) {
        let _ = std::fs::remove_file(&tmp);
        return None;
    }
    finalize(&tmp, &out)
}

#[cfg(test)]
mod tests;
