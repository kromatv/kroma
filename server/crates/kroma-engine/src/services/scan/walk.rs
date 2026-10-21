//! The phase-1 filesystem walk: a parallel jwalk traversal of one library
//! folder that `stat`s each video file and groups it (via [`crate::domain::naming`])
//! into the shared logical-item / show maps.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use jwalk::{Parallelism, WalkDirGeneric};
use tracing::{debug, warn};

use crate::domain::naming;
use crate::model::{MediaFile, MediaItem, Show};

use super::ids::{detect_edition, short_hash};
use super::index::index_parsed;
use super::now_iso8601;

pub use kroma_media::video::{has_video_extension, VIDEO_EXTENSIONS};

/// Scan one folder belonging to `lib_id`, accumulating items (by logical id) and
/// shows into the shared maps. Flags/ids track what this library contributed so
/// the caller can compute its kind + item count across all its folders.
///
/// Returns how many entries the walk could not read: a symlink whose target is
/// not mounted resolves to nothing, and a whole library of those otherwise
/// scans clean and empty.
#[allow(clippy::too_many_arguments)]
pub(super) fn scan_root(
    lib_id: &str,
    root: &Path,
    items: &mut HashMap<String, MediaItem>,
    shows: &mut HashMap<String, Show>,
    mtimes: &mut HashMap<String, Option<i64>>,
    lib_item_ids: &mut std::collections::HashSet<String>,
    movie_seen: &mut bool,
    episode_seen: &mut bool,
) -> usize {
    let lib_name = root
        .file_name()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("library")
        .to_string();
    let added_at = now_iso8601();

    // Resolve the root once (cheap, single syscall) so file abs-paths are stable
    // without a per-file `canonicalize()` (which is very slow over SMB).
    let abs_root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());

    // Phase-1 walk: jwalk traverses directories on a large thread pool and stats
    // files *in that pool*, so the readdir/stat network round-trips over SMB run
    // concurrently instead of serially (minutes → seconds). Synology `@eaDir`
    // and hidden dirs are pruned from the descent.
    let descended = Arc::new(Mutex::new(HashSet::from([abs_root.clone()])));
    let walk = WalkDirGeneric::<((), FileMeta)>::new(root)
        .follow_links(true)
        .skip_hidden(false)
        .parallelism(Parallelism::RayonNewPool(walk_threads()))
        .process_read_dir(move |_depth, _path, _state, children| {
            prepare_children(&descended, children);
        });

    let mut unreadable = 0usize;
    let mut first_unreadable: Option<PathBuf> = None;
    for result in walk {
        let entry = match result {
            Ok(entry) => entry,
            Err(err) => {
                unreadable += 1;
                first_unreadable.get_or_insert_with(|| err.path().unwrap_or(root).to_path_buf());
                debug!("skipping an unreadable entry: {err}");
                continue;
            }
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if !has_video_extension(&path) {
            continue;
        }
        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        // Build the absolute path by joining the resolved root with the relative
        // path no extra stat / symlink resolution per file.
        let abs = abs_root.join(&rel);

        let (size, mtime) = match entry.client_state {
            Some((s, m)) => (Some(s), Some(m)),
            None => (None, None),
        };

        let container = path
            .extension()
            .and_then(std::ffi::OsStr::to_str)
            .unwrap_or("")
            .to_ascii_lowercase();

        let file_name = path
            .file_name()
            .and_then(std::ffi::OsStr::to_str)
            .unwrap_or("");
        let edition = detect_edition(file_name);

        let file = MediaFile {
            id: short_hash(&abs.to_string_lossy()),
            rel_path: Some(rel),
            container,
            duration_ms: None,
            video: None,
            audio: None,
            audio_tracks: Vec::new(),
            subtitles: Vec::new(),
            size,
            edition,
            probed: false,
            unreadable: None,
            edition_id: None,
            abs_path: Some(abs.to_string_lossy().to_string()),
        };
        index_parsed(
            naming::parse(root, &path),
            lib_id,
            &added_at,
            file,
            mtime,
            items,
            shows,
            mtimes,
            lib_item_ids,
            movie_seen,
            episode_seen,
        );

        debug!("indexed file under {}", lib_name);
    }

    if let Some(path) = first_unreadable {
        warn!(
            folder = %root.display(),
            unreadable,
            example = %path.display(),
            "entries skipped: a symlink whose target is not mounted reads as missing"
        );
    }
    unreadable
}

// jwalk `process_read_dir` body: prune Synology/hidden dirs and already-visited
// symlink targets from the descent, and stat each file *in the walk's thread
// pool* (so the SMB round-trips overlap).
fn prepare_children(
    descended: &Mutex<HashSet<PathBuf>>,
    children: &mut Vec<jwalk::Result<jwalk::DirEntry<((), FileMeta)>>>,
) {
    children.retain(|res| match res {
        Ok(e) => !(e.file_type().is_dir() && is_pruned_dir(&e.file_name)),
        Err(_) => true,
    });
    for e in children.iter_mut().flatten() {
        if e.file_type().is_file() {
            e.client_state = file_meta(&e.path());
        } else if e.file_type().is_dir()
            && e.path_is_symlink()
            && !first_descent(descended, &e.path())
        {
            e.read_children = None;
        }
    }
}

// jwalk's own guard compares a symlink's raw target against the ancestor paths,
// so `link -> /abs/ancestor` is caught and `link -> .` is not: the kernel's
// 32-symlink ceiling then bounds the depth, which two such links in one
// directory turn into 2^32 paths.
fn first_descent(descended: &Mutex<HashSet<PathBuf>>, dir: &Path) -> bool {
    let Ok(resolved) = dir.canonicalize() else {
        return false;
    };
    match descended.lock() {
        Ok(mut seen) => seen.insert(resolved),
        Err(poisoned) => poisoned.into_inner().insert(resolved),
    }
}

// Per-file metadata carried through the parallel jwalk: (size, mtime-secs).
type FileMeta = Option<(u64, i64)>;

// Concurrency for the directory walk. Metadata ops are latency-bound (not CPU),
// so more threads than cores overlap the round-trips but a NAS serving its
// own local disks gains nothing past a handful, and 64 idle-blocked threads
// still cost stacks + scheduler churn on a 2-4 core box. `KROMA_WALK_THREADS`
// overrides for genuinely remote mounts.
fn walk_threads() -> usize {
    if let Some(n) = std::env::var("KROMA_WALK_THREADS")
        .ok()
        .and_then(|s| s.parse().ok())
    {
        return n;
    }
    let cores = std::thread::available_parallelism()
        .map(std::num::NonZeroUsize::get)
        .unwrap_or(4);
    (cores * 4).clamp(8, 32)
}

// Directories pruned from the walk: Synology metadata (`@eaDir`) and hidden.
fn is_pruned_dir(name: &std::ffi::OsStr) -> bool {
    let n = name.to_string_lossy();
    n == "@eaDir" || n.starts_with('.')
}

// `stat` one file (run inside the parallel walk pool): (size, mtime-as-unix-secs).
fn file_meta(path: &Path) -> FileMeta {
    let md = std::fs::metadata(path).ok()?;
    let mtime = md
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    Some((md.len(), mtime))
}

#[cfg(test)]
mod tests;
