use std::path::Path;
use std::process::Command;

use kroma_primitives::short_hash;

use super::encode::encode_webp;
use super::scratch::{finalize, unique_tmp};
use super::{images_dir, PUBLIC_PREFIX};

pub(super) fn cache_verbatim(data_dir: &Path, remote_url: &str, ext: &str) -> Option<String> {
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
            .arg("--")
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

/// Ensures a remote image is cached as WebP and returns its public path, or
/// `None` on failure (the caller keeps the provider URL). The entry point for
/// art that arrives outside title enrichment, e.g. a person's portrait.
pub fn cache_remote(data_dir: &Path, remote_url: &str) -> Option<String> {
    cache(data_dir, remote_url)
}

/// Whether `url` names a cached image whose file is no longer on disk.
pub fn local_art_missing(data_dir: &Path, url: &str) -> bool {
    url.strip_prefix(PUBLIC_PREFIX)
        .is_some_and(|name| !images_dir(data_dir).join(name).exists())
}

pub(super) fn cache(data_dir: &Path, remote_url: &str) -> Option<String> {
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

fn transcode(remote_url: &str, out: &Path) -> bool {
    let src_tmp = unique_tmp(out);
    let dl = Command::new("curl")
        .args(["-sf", "-L", "--max-time", "25", "-o"])
        .arg(&src_tmp)
        .arg("--")
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_cached_url_whose_file_is_gone_is_missing_and_a_remote_one_never_is() {
        let dir = kroma_testing::temp_dir("image-missing");
        std::fs::create_dir_all(images_dir(dir.path())).unwrap();
        std::fs::write(images_dir(dir.path()).join("here.webp"), b"x").unwrap();

        assert!(!local_art_missing(dir.path(), "/api/images/here.webp"));
        assert!(local_art_missing(dir.path(), "/api/images/gone.webp"));
        assert!(!local_art_missing(dir.path(), "https://img.example/p.jpg"));
    }
}
