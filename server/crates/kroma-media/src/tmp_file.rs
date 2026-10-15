//! Writing a file something else is already serving, by way of a sibling temp.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static SEQ: AtomicU64 = AtomicU64::new(0);

/// A temp sibling of `out` that keeps `out`'s extension last, so ffmpeg and
/// cwebp still infer the format from it, and that no concurrent writer of the
/// same path can collide with.
pub fn unique_tmp(out: &Path) -> PathBuf {
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let base = out
        .file_name()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("out");
    let ext = out
        .extension()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("tmp");
    out.with_file_name(format!("{base}.{}.{seq}.tmp.{ext}", std::process::id()))
}

/// Move a written temp onto the path readers ask for, cleaning the temp up when
/// it cannot. Whether it landed.
pub fn finalize(tmp: &Path, out: &Path) -> bool {
    match std::fs::rename(tmp, out) {
        Ok(()) => true,
        Err(_) => {
            let _ = std::fs::remove_file(tmp);
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_temp_keeps_the_extension_the_encoder_reads_the_format_from() {
        let tmp = unique_tmp(Path::new("/cache/sheet.webp"));

        assert_eq!(tmp.extension().unwrap(), "webp");
        assert_eq!(tmp.parent().unwrap(), Path::new("/cache"));
    }

    #[test]
    fn two_writers_of_one_path_are_given_two_temps() {
        let out = Path::new("/cache/sheet.jpg");

        let (first, second) = (unique_tmp(out), unique_tmp(out));

        assert_ne!(first, second);
    }

    #[test]
    fn a_temp_that_cannot_be_moved_is_not_left_behind() {
        let dir = kroma_testing::temp_dir("tmp-file");
        let tmp = dir.path().join("cue.vtt.part");
        std::fs::write(&tmp, b"WEBVTT").unwrap();

        let landed = finalize(&tmp, &dir.path().join("gone").join("cue.vtt"));

        assert!(!landed);
        assert!(!tmp.exists());
    }
}
