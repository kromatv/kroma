//! The phase-1 filesystem walk: a parallel jwalk traversal of one library
//! folder that `stat`s each video file and groups it (via [`crate::domain::naming`])
//! into the shared logical-item / show maps.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use jwalk::{Parallelism, WalkDirGeneric};
use tracing::{debug, warn};

use crate::model::MediaFile;

use super::batches::Batches;
use super::found::LibraryWalk;
use super::ids::{detect_edition, short_hash};
use super::index::index_parsed;
use super::now_iso8601;

use descent::Descent;

mod descent;

pub use kroma_media::video::{has_video_extension, VIDEO_EXTENSIONS};

/// Scan one folder of `lib`'s library, accumulating items (by logical id) and
/// shows into the shared maps. Flags/ids track what this library contributed so
/// the caller can compute its kind + item count across all its folders.
///
/// Returns how many entries the walk could not read: a symlink whose target is
/// not mounted resolves to nothing, and a whole library of those otherwise
/// scans clean and empty.
pub(super) fn scan_root<S>(
    root: &Path,
    lib: &mut LibraryWalk<'_>,
    batches: &mut Batches<'_, S>,
) -> Result<usize, S> {
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
    let descent = Descent::new(root, &abs_root, lib.found.subtitles.clone());
    let walk = WalkDirGeneric::<((), FileMeta)>::new(root)
        .follow_links(true)
        .skip_hidden(false)
        .parallelism(Parallelism::RayonNewPool(walk_threads()))
        .process_read_dir(move |_depth, _path, _state, children| {
            prepare_children(&descent, children);
        });

    let mut unreadable = Skipped::default();
    let mut unplaced = Skipped::default();
    for result in walk {
        if batches.due() {
            batches.close(&lib.library(), lib.found)?;
        }
        let entry = match result {
            Ok(entry) => entry,
            Err(err) => {
                unreadable.note(err.path().unwrap_or(root));
                debug!("skipping an unreadable entry: {err}");
                continue;
            }
        };
        let Some((file, mtime)) = video_file(root, &abs_root, &entry) else {
            continue;
        };
        let path = entry.path();
        let Some(parsed) = lib.parse(root, &path) else {
            unplaced.note(&path);
            continue;
        };
        batches.note(index_parsed(
            parsed,
            &lib.def.id,
            &added_at,
            file,
            mtime,
            &mut lib.found.items,
            &mut lib.found.shows,
            &mut lib.found.mtimes,
            &mut lib.item_ids,
            &mut lib.movie_seen,
            &mut lib.episode_seen,
        ));

        debug!("indexed file under {}", lib_name);
    }

    unreadable.warn(
        root,
        "entries skipped: a symlink whose target is not mounted reads as missing",
    );
    unplaced.warn(
        root,
        "files left out: a Series library holds episodes, and these names carry no episode number",
    );
    Ok(unreadable.count)
}

#[derive(Default)]
struct Skipped {
    count: usize,
    first: Option<PathBuf>,
}

impl Skipped {
    fn note(&mut self, path: &Path) {
        self.count += 1;
        self.first.get_or_insert_with(|| path.to_path_buf());
    }

    fn warn(&self, folder: &Path, what: &str) {
        if let Some(example) = &self.first {
            warn!(
                folder = %folder.display(),
                count = self.count,
                example = %example.display(),
                "{what}"
            );
        }
    }
}

type WalkEntry = jwalk::DirEntry<((), FileMeta)>;

fn video_file(root: &Path, abs_root: &Path, entry: &WalkEntry) -> Option<(MediaFile, Option<i64>)> {
    let path = entry.path();
    if !entry.file_type().is_file() || !has_video_extension(&path) {
        return None;
    }
    let rel = path.trim_prefix(root).to_string_lossy().replace('\\', "/");
    let abs = abs_root.join(&rel).to_string_lossy().to_string();
    let (size, mtime) = entry.client_state.unzip();
    let file = MediaFile {
        id: short_hash(&abs),
        rel_path: Some(rel),
        container: container_of(&path),
        duration_ms: None,
        video: None,
        audio: None,
        audio_tracks: Vec::new(),
        subtitles: Vec::new(),
        size,
        edition: detect_edition(path.file_name().and_then(OsStr::to_str).unwrap_or("")),
        probed: false,
        unreadable: None,
        edition_id: None,
        abs_path: Some(abs),
    };
    Some((file, mtime))
}

fn container_of(path: &Path) -> String {
    path.extension()
        .and_then(OsStr::to_str)
        .unwrap_or("")
        .to_ascii_lowercase()
}

// jwalk `process_read_dir` body: prune Synology/hidden dirs and already-visited
// symlink targets from the descent, and stat each file *in the walk's thread
// pool* (so the SMB round-trips overlap).
fn prepare_children(descent: &Descent, children: &mut Vec<jwalk::Result<WalkEntry>>) {
    children.retain(|res| match res {
        Ok(e) => !(e.file_type().is_dir() && is_pruned_dir(&e.file_name)),
        Err(_) => true,
    });
    descent.note_subtitles(children);
    for e in children.iter_mut().flatten() {
        if e.file_type().is_file() {
            e.client_state = file_meta(&e.path());
        } else if descent.already_walked_link(e) {
            e.read_children = None;
        }
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

/// Whether a walk writes the file at `below`, its path below the folder the
/// walk starts in: a video container, in no folder the walk prunes.
pub fn takes(below: &Path) -> bool {
    let mut folders = below.parent().into_iter().flat_map(Path::components);
    has_video_extension(below) && !folders.any(|folder| is_pruned_dir(folder.as_os_str()))
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
