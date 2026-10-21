use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

// Keeps `out`'s extension so ffmpeg/cwebp still detect the output format.
pub(super) fn unique_tmp(out: &Path) -> PathBuf {
    let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let base = out
        .file_name()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("rendition");
    let ext = out
        .extension()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("tmp");
    out.with_file_name(format!("{base}.{}.{seq}.tmp.{ext}", std::process::id()))
}

pub(super) fn finalize(tmp: &Path, out: &Path) -> Option<PathBuf> {
    match std::fs::rename(tmp, out) {
        Ok(()) => Some(out.to_path_buf()),
        Err(_) => {
            let _ = std::fs::remove_file(tmp);
            None
        }
    }
}
