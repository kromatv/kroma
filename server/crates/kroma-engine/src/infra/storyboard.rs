//! YouTube-style scrub-bar preview "storyboard": one sprite sheet (a mosaic of
//! evenly-spaced thumbnails) plus a tiny JSON manifest, generated once per file
//! and cached on disk. The player shows the tile under the cursor via CSS
//! `background-position` - no per-frame work, a single image fetch.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::sync::Semaphore;
use tracing::warn;

use crate::model::MediaItem;
use kroma_primitives::short_hash;

mod render;

// Bump to invalidate every cached sheet when the generation parameters change.
const VERSION: u32 = 3;
// Max concurrent storyboard items, keeping generation off the HLS remux's
// back when several items are opened at once.
const MAX_CONCURRENT: usize = 2;
// After a failed generation, don't retry the same key for this long: the
// player polls the manifest every few seconds, and without a cooldown a
// persistent failure would re-spawn ffmpeg on every poll.
const FAIL_COOLDOWN: Duration = Duration::from_secs(120);

/// What the player needs to map a cursor time → a tile in the sheet.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    // The `v` query param busts the immutable cache when the source file (its
    // mtime) changes.
    pub url: String,
    pub interval: f64,
    pub tile_w: u32,
    pub tile_h: u32,
    pub cols: u32,
    pub rows: u32,
    // Trailing grid cells beyond this may be blank padding.
    pub count: u32,
    pub duration: f64,
}

pub enum Status {
    Ready(Manifest),
    Pending,
    Unavailable,
}

pub struct Storyboard {
    dir: PathBuf,
    inflight: Arc<Mutex<HashSet<String>>>,
    failed: Arc<Mutex<HashMap<String, Instant>>>,
    sem: Arc<Semaphore>,
}

impl Storyboard {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            dir: data_dir.join("storyboards"),
            inflight: Arc::new(Mutex::new(HashSet::new())),
            failed: Arc::new(Mutex::new(HashMap::new())),
            sem: Arc::new(Semaphore::new(MAX_CONCURRENT)),
        }
    }

    // Bumping the source remaps the key, so a replaced file regenerates
    // instead of serving a stale sheet.
    fn key(abs: &str, tiles: &str) -> String {
        let mtime = std::fs::metadata(abs)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        short_hash(&format!("{abs}:{mtime}:v{VERSION}{tiles}"))
    }

    /// Cached sheet bytes + content type for `item`, trying WebP then JPEG; `None`
    /// if it has not been generated yet.
    pub async fn sheet(&self, item: &MediaItem) -> Option<(Vec<u8>, &'static str)> {
        let abs = item.abs_path.clone()?;
        let tiles = tile_path(item);
        // `key` derivation does a blocking `fs::metadata`; run it off the async
        // worker so a stalled mount can't wedge the runtime.
        let key = tokio::task::spawn_blocking(move || Self::key(&abs, tiles))
            .await
            .ok()?;
        for (ext, ct) in [("webp", "image/webp"), ("jpg", "image/jpeg")] {
            if let Ok(bytes) = tokio::fs::read(self.dir.join(format!("{key}.{ext}"))).await {
                return Some((bytes, ct));
            }
        }
        None
    }

    /// Delete `item`'s cached sheet + manifest, so a reprocess regenerates it
    /// (the cache key is content-addressed, so this is the only way to force a
    /// rebuild without a source change).
    pub fn invalidate(&self, item: &MediaItem) {
        let Some(abs) = item.abs_path.as_deref() else {
            return;
        };
        let key = Self::key(abs, tile_path(item));
        for ext in ["webp", "jpg", "json"] {
            let _ = std::fs::remove_file(self.dir.join(format!("{key}.{ext}")));
        }
    }

    /// Whether `item`'s storyboard is already on disk.
    pub fn is_cached(&self, item: &MediaItem) -> bool {
        let Some(abs) = item.abs_path.as_deref() else {
            return false;
        };
        self.dir
            .join(format!("{}.json", Self::key(abs, tile_path(item))))
            .exists()
    }

    /// The manifest if cached; otherwise kick off generation (deduped +
    /// concurrency-bounded) and report `Pending` for the caller to poll.
    pub async fn get(&self, item: &MediaItem) -> Status {
        let Some((abs, dur_s)) = playable(item) else {
            return Status::Unavailable;
        };
        // `key` derivation does a blocking `fs::metadata`; run it off the async
        // worker so a stalled mount can't wedge the runtime. The same stat also
        // answers "does the source even exist" an offline mount must not spawn
        // a doomed ffmpeg (let alone one per poll).
        let abs_key = abs.clone();
        let tiles = tile_path(item);
        let Ok((key, exists)) = tokio::task::spawn_blocking(move || {
            (Self::key(&abs_key, tiles), Path::new(&abs_key).exists())
        })
        .await
        else {
            return Status::Unavailable;
        };
        if let Ok(bytes) = tokio::fs::read(self.dir.join(format!("{key}.json"))).await {
            if let Ok(m) = serde_json::from_slice::<Manifest>(&bytes) {
                return Status::Ready(m);
            }
        }
        if !exists {
            return Status::Unavailable;
        }
        if let Some(at) = self.failed.lock().unwrap().get(&key) {
            if at.elapsed() < FAIL_COOLDOWN {
                return Status::Unavailable;
            }
        }

        if !self.inflight.lock().unwrap().insert(key.clone()) {
            return Status::Pending;
        }
        let dir = self.dir.clone();
        let inflight = self.inflight.clone();
        let failed = self.failed.clone();
        let sem = self.sem.clone();
        let item_id = item.id.clone();
        let log_id = item.id.clone();
        tokio::spawn(async move {
            let _permit = sem.acquire_owned().await; // bound concurrent ffmpeg
            let key2 = key.clone();
            let res = tokio::task::spawn_blocking(move || {
                render::generate(&abs, &dir, &key2, &item_id, dur_s, &|| false)
            })
            .await
            .unwrap_or_else(|e| Err(format!("generation task crashed: {e}")));
            match res {
                Err(reason) => {
                    warn!(item = %log_id, "storyboard generation failed: {reason}");
                    failed.lock().unwrap().insert(key.clone(), Instant::now());
                }
                Ok(()) => {
                    failed.lock().unwrap().remove(&key);
                }
            }
            inflight.lock().unwrap().remove(&key);
        });
        Status::Pending
    }
}

fn tile_path(item: &MediaItem) -> &'static str {
    tiles_of(item.video.as_ref().and_then(|video| video.bit_depth))
}

fn tiles_of(bit_depth: Option<u32>) -> &'static str {
    match bit_depth {
        Some(depth) if depth > 8 => ":rgb24",
        _ => "",
    }
}

fn playable(item: &MediaItem) -> Option<(String, f64)> {
    let abs = item.abs_path.clone()?;
    let ms = item.duration_ms.filter(|&d| d > 0)?;
    Some((abs, ms as f64 / 1000.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_ten_bit_source_keys_its_sheet_apart_from_the_black_one_it_had() {
        let eight = Storyboard::key("/films/one.mkv", tiles_of(Some(8u32)));

        let ten = Storyboard::key("/films/one.mkv", tiles_of(Some(10u32)));

        assert_eq!(eight, Storyboard::key("/films/one.mkv", ""));
        assert_ne!(ten, eight);
    }

    #[test]
    fn a_source_whose_depth_nothing_measured_keeps_the_sheet_it_has() {
        let kept = [None, Some(8u32)].map(tiles_of);

        assert_eq!(kept, ["", ""]);
        assert_eq!(tiles_of(Some(12u32)), ":rgb24");
    }
}
