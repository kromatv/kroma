//! Local MP3 cache for TV theme songs, from the community "tvthemes" archive
//! (`http://tvthemes.plexapp.com/<tvdb>.mp3`, keyed by TheTVDB series id).
//! Best-effort: a 404, no network or no `curl` leaves `theme_url` unset.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::model::Metadata;

pub const PUBLIC_PREFIX: &str = "/api/themes/";

const ARCHIVE: &str = "http://tvthemes.plexapp.com";

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
        .args(["-sf", "-L", "--max-time", "25", "--max-filesize", "30M", "-o"])
        .arg(&tmp)
        .arg(&url)
        .status();
    let ok = matches!(dl, Ok(s) if s.success())
        && std::fs::metadata(&tmp).map(|m| m.len() >= MIN_BYTES).unwrap_or(false);
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

fn unique_tmp(out: &Path) -> PathBuf {
    let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let base = out.file_name().and_then(|n| n.to_str()).unwrap_or("theme.mp3");
    out.with_file_name(format!("{base}.{}.{seq}.tmp.mp3", std::process::id()))
}
