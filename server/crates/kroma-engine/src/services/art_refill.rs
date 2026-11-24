//! Putting back one cached image whose file is gone. The rows that name its
//! path say which title it belongs to, and enriching that title again caches
//! every image its payload names under the same content-addressed name. A
//! picture kept beside a title's files is cached again from that file.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use crate::db;
use crate::infra::image;
use crate::services::art_beside;
use crate::state::SharedState;

/// One lock per subject, so a page of stills from one show enriches it once
/// and the other requests find their file when the first is done.
#[derive(Default)]
pub struct Inflight(Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>);

impl Inflight {
    fn lock_for(&self, key: &str) -> Arc<tokio::sync::Mutex<()>> {
        let mut map = self
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        map.entry(key.to_string()).or_default().clone()
    }
}

/// Whether `name` is on disk once the title it belongs to has been enriched
/// again, or once the picture kept beside a title's files that it is named
/// after has been cached again. False when no row names it, when there is no
/// provider to ask, or when the provider could not be reached.
pub async fn refill(state: &SharedState, name: &str) -> bool {
    let path = image::images_dir(&state.config.data_dir).join(name);
    let url = format!("{}{name}", image::PUBLIC_PREFIX);
    if name.starts_with(image::BESIDE_PREFIX) {
        return refill_beside(state, path, url).await;
    }
    let pool = state.db.clone();
    let found = tokio::task::spawn_blocking(move || db::art_owner(&pool, &url)).await;
    let Ok(Ok(Some(owner))) = found else {
        return false;
    };
    let lock = state.art_refills.lock_for(&format!("{}:{}", owner.kind, owner.id));
    let _held = lock.lock().await;
    if path.exists() {
        return true;
    }
    let is_show = owner.kind == db::metadata_core::SHOW;
    let st = state.clone();
    let _ = tokio::task::spawn_blocking(move || {
        crate::services::enrich::enrich_one(&st, &owner.id, is_show)
    })
    .await;
    path.exists()
}

async fn refill_beside(state: &SharedState, path: PathBuf, url: String) -> bool {
    let lock = state.art_refills.lock_for(&url);
    let _held = lock.lock().await;
    let pool = state.db.clone();
    let cached = tokio::task::spawn_blocking(move || {
        let Ok(Some(source)) = db::art_beside::source_of(&pool, &url) else {
            return path.exists();
        };
        let width = art_beside::max_width(&source.role);
        let cached = image::cache_picture_beside(Path::new(&source.path), &path, width);
        if !cached {
            let _ = db::art_beside::forget(&pool, &url);
        }
        cached
    });
    cached.await.unwrap_or(false)
}
