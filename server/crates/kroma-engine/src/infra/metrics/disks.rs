//! Mounted volumes, for the storage page and the dashboard's disk figures.

use std::sync::{OnceLock, RwLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use sysinfo::Disks;

/// One mounted volume's usage.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub name: String,
    pub mount: String,
    pub fs: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
}

/// Read all mounted volumes (deduped by mount point), largest first. Enumerating
/// + statfs'ing every mount is comparatively expensive on a NAS with many
///   volumes, and usage moves slowly, so results are cached for a short window
///   (the storage page and dashboard poll this endpoint repeatedly).
pub fn read_disks() -> Vec<DiskInfo> {
    type DiskCache = OnceLock<RwLock<Option<(Instant, Vec<DiskInfo>)>>>;
    static CACHE: DiskCache = OnceLock::new();
    const TTL: Duration = Duration::from_secs(15);

    let cache = CACHE.get_or_init(|| RwLock::new(None));
    if let Some((at, disks)) = cache.read().unwrap().as_ref() {
        if at.elapsed() < TTL {
            return disks.clone();
        }
    }
    let fresh = read_disks_uncached();
    *cache.write().unwrap() = Some((Instant::now(), fresh.clone()));
    fresh
}

fn read_disks_uncached() -> Vec<DiskInfo> {
    let disks = Disks::new_with_refreshed_list();
    let mut seen = std::collections::HashSet::new();
    let mut out: Vec<DiskInfo> = Vec::new();
    for d in disks.list() {
        let mount = d.mount_point().to_string_lossy().to_string();
        // Skip pseudo/duplicate mounts and anything with no capacity.
        if d.total_space() == 0 || !seen.insert(mount.clone()) {
            continue;
        }
        let total = d.total_space();
        let avail = d.available_space();
        out.push(DiskInfo {
            name: d.name().to_string_lossy().to_string(),
            mount,
            fs: d.file_system().to_string_lossy().to_string(),
            total_bytes: total,
            used_bytes: total.saturating_sub(avail),
            available_bytes: avail,
        });
    }
    out.sort_by_key(|b| std::cmp::Reverse(b.total_bytes));
    out
}
