//! Local MP3 cache for TV theme songs, from the community "tvthemes" archive
//! (`https://tvthemes.plexapp.com/<tvdb>.mp3`, keyed by TheTVDB series id).
//! Best-effort: a 404, no network or no `curl` leaves `theme_url` unset.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::model::Metadata;

pub const PUBLIC_PREFIX: &str = "/api/themes/";

const ARCHIVE: &str = "https://tvthemes.plexapp.com";

// Anything smaller is an error body, not a theme.
const MIN_BYTES: u64 = 8 * 1024;

static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

pub fn themes_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("themes")
}

/// Rewrites `meta.theme_url` to a locally-cached MP3, or leaves the metadata
/// unchanged when there is no `tvdb_id`, a theme already, or no download.
pub fn localize(data_dir: &Path, mut meta: Metadata) -> Metadata {
    if meta.theme_url.is_some() {
        return meta;
    }
    if let Some(tvdb_id) = meta.tvdb_id {
        if let Some(local) = cache(data_dir, tvdb_id) {
            meta.theme_url = Some(local);
        }
    }
    meta
}

fn cache(data_dir: &Path, tvdb_id: u64) -> Option<String> {
    let dir = themes_dir(data_dir);
    std::fs::create_dir_all(&dir).ok()?;

    // `tvdb_id` is numeric, so the filename is path-safe by construction.
    let name = format!("{tvdb_id}.mp3");
    let out = dir.join(&name);
    if !out.exists() && !download(tvdb_id, &out) {
        return None;
    }
    Some(format!("{PUBLIC_PREFIX}{name}"))
}

// Renames from a unique temp, so no reader sees a partial file.
fn download(tvdb_id: u64, out: &Path) -> bool {
    let url = format!("{ARCHIVE}/{tvdb_id}.mp3");
    let tmp = unique_tmp(out);
    // `-f` fails on HTTP >= 400 (the archive 404s for unknown shows); the time
    // and size bounds stop a bad URL stalling or ballooning the pass.
    let dl = Command::new("curl")
        .args([
            "-sf",
            "-L",
            // https only, redirects included: in plain HTTP the series ids of
            // the library travel readable, and a redirect could aim the fetch
            // at an internal host.
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--max-redirs",
            "2",
            "--max-time",
            "25",
            "--max-filesize",
            "30M",
            "-o",
        ])
        .arg(&tmp)
        .arg("--")
        .arg(&url)
        .status();
    let ok = matches!(dl, Ok(s) if s.success())
        && std::fs::metadata(&tmp)
            .map(|m| m.len() >= MIN_BYTES)
            .unwrap_or(false)
        && looks_like_audio(&tmp);
    if !ok {
        let _ = std::fs::remove_file(&tmp);
        return false;
    }
    match std::fs::rename(&tmp, out) {
        Ok(()) => true,
        Err(_) => {
            let _ = std::fs::remove_file(&tmp);
            false
        }
    }
}

// The archive serves MP3s; a redirected body that is not one (an HTML error
// page, or whatever an internal host returned to a redirected fetch) is not
// stored and never reaches a client.
fn looks_like_audio(path: &Path) -> bool {
    let Ok(bytes) = std::fs::read(path) else {
        return false;
    };
    bytes.starts_with(b"ID3") || bytes.starts_with(&[0xff, 0xfb]) || bytes.starts_with(&[0xff, 0xf3])
}

fn unique_tmp(out: &Path) -> PathBuf {
    let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let base = out
        .file_name()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("theme.mp3");
    out.with_file_name(format!("{base}.{}.{seq}.tmp.mp3", std::process::id()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_mp3_shaped_bytes_pass_the_audio_check() {
        let dir = kroma_testing::temp_dir("theme-magic");
        let mp3 = dir.path().join("a.mp3");
        std::fs::write(&mp3, b"ID3\x03\x00data").unwrap();
        let html = dir.path().join("b.mp3");
        std::fs::write(&html, b"<html>nope</html>").unwrap();

        assert!(looks_like_audio(&mp3));
        assert!(!looks_like_audio(&html));
    }
}
