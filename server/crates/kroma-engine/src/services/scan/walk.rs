//! The phase-1 filesystem walk: a parallel jwalk traversal of one library
//! folder that `stat`s each video file and groups it (via [`crate::domain::naming`])
//! into the shared logical-item / show maps.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use jwalk::{Parallelism, WalkDirGeneric};
use tracing::{debug, warn};

use crate::domain::naming::{self, Parsed};
use crate::model::{Kind, MediaFile, MediaItem, Show};

use super::ids::{detect_edition, episode_logical_id, movie_logical_id, short_hash, show_key};
use super::now_iso8601;

/// Extensions we treat as playable video. Public so the relocated acquisition
/// importer (tv.kroma.torrents) can share the exact same set.
pub const VIDEO_EXTENSIONS: &[&str] = &["mkv", "mp4", "m4v", "mov", "webm", "avi", "ts"];

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
            e.read_children_path = None;
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

/// Fold one parsed video file into the shared item / show maps: a movie upserts a
/// `Movie` item; an episode upserts its show (widening a missing year) then the
/// episode item. Either way the file + its mtime are recorded.
#[allow(clippy::too_many_arguments)]
fn index_parsed(
    parsed: Parsed,
    lib_id: &str,
    added_at: &str,
    file: MediaFile,
    mtime: Option<i64>,
    items: &mut HashMap<String, MediaItem>,
    shows: &mut HashMap<String, Show>,
    mtimes: &mut HashMap<String, Option<i64>>,
    lib_item_ids: &mut std::collections::HashSet<String>,
    movie_seen: &mut bool,
    episode_seen: &mut bool,
) {
    match parsed {
        Parsed::Movie { title, year } => {
            *movie_seen = true;
            let title = if title.is_empty() {
                "Untitled".into()
            } else {
                title
            };
            let logical = movie_logical_id(lib_id, &title, year);
            lib_item_ids.insert(logical.clone());
            let item = items.entry(logical.clone()).or_insert_with(|| MediaItem {
                id: logical.clone(),
                title: title.clone(),
                kind: Kind::Movie,
                year,
                duration_ms: None,
                container: String::new(),
                video: None,
                audio: None,
                audio_tracks: Vec::new(),
                subtitles: Vec::new(),
                library: lib_id.to_string(),
                show_id: None,
                show_title: None,
                season: None,
                episode: None,
                episode_end: None,
                episode_title: None,
                rel_path: None,
                added_at: added_at.to_string(),
                metadata: None,
                abs_path: None,
                files: Vec::new(),
                default_file_id: None,
                markers: Vec::new(),
                audio_analysis: None,
            });
            mtimes.insert(file.id.clone(), mtime);
            item.files.push(file);
        }
        Parsed::Episode {
            show_title,
            show_year,
            season,
            episode,
            episode_end,
            episode_title,
        } => {
            *episode_seen = true;
            let show_id = show_key(lib_id, &show_title);
            shows
                .entry(show_id.clone())
                .and_modify(|s| {
                    if s.year.is_none() {
                        s.year = show_year;
                    }
                })
                .or_insert_with(|| Show {
                    id: show_id.clone(),
                    title: show_title.clone(),
                    year: show_year,
                    library: lib_id.to_string(),
                    season_count: 0,
                    episode_count: 0,
                    video: None,
                    added_at: added_at.to_string(),
                    metadata: None,
                    progress: None,
                });

            let logical = episode_logical_id(&show_id, season, episode);
            lib_item_ids.insert(logical.clone());
            let title = episode_title
                .clone()
                .unwrap_or_else(|| format!("S{season:02}E{episode:02}"));
            let item = items.entry(logical.clone()).or_insert_with(|| MediaItem {
                id: logical.clone(),
                title: title.clone(),
                kind: Kind::Episode,
                year: show_year,
                duration_ms: None,
                container: String::new(),
                video: None,
                audio: None,
                audio_tracks: Vec::new(),
                subtitles: Vec::new(),
                library: lib_id.to_string(),
                show_id: Some(show_id.clone()),
                show_title: Some(show_title.clone()),
                season: Some(season),
                episode: Some(episode),
                episode_end,
                episode_title: episode_title.clone(),
                rel_path: None,
                added_at: added_at.to_string(),
                metadata: None,
                abs_path: None,
                files: Vec::new(),
                default_file_id: None,
                markers: Vec::new(),
                audio_analysis: None,
            });
            mtimes.insert(file.id.clone(), mtime);
            item.files.push(file);
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

fn has_video_extension(path: &Path) -> bool {
    path.extension()
        .and_then(std::ffi::OsStr::to_str)
        .map(|e| VIDEO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsStr;

    #[test]
    fn has_video_extension_matches_known_containers_case_insensitively() {
        assert!(has_video_extension(Path::new("/movies/Film.mkv")));
        assert!(has_video_extension(Path::new("/movies/Film.MP4"))); // case-insensitive
        assert!(has_video_extension(Path::new("clip.MOV")));
        assert!(has_video_extension(Path::new("a.ts")));
        // Non-video and edge cases.
        assert!(!has_video_extension(Path::new("/movies/poster.jpg")));
        assert!(!has_video_extension(Path::new("/movies/subs.srt")));
        assert!(!has_video_extension(Path::new("/movies/noext")));
        assert!(!has_video_extension(Path::new("/movies/.hidden")));
    }

    #[test]
    fn is_pruned_dir_skips_synology_and_hidden() {
        assert!(is_pruned_dir(OsStr::new("@eaDir")));
        assert!(is_pruned_dir(OsStr::new(".git")));
        assert!(is_pruned_dir(OsStr::new(".DS_Store")));
        assert!(!is_pruned_dir(OsStr::new("Season 1")));
        assert!(!is_pruned_dir(OsStr::new("Movies")));
    }

    #[test]
    fn walk_threads_default_range_and_env_override() {
        // Default (no env): clamped into [8, 32].
        std::env::remove_var("KROMA_WALK_THREADS");
        let n = walk_threads();
        assert!((8..=32).contains(&n), "default {n} out of clamp range");

        // Explicit override is honored verbatim (not re-clamped).
        std::env::set_var("KROMA_WALK_THREADS", "3");
        assert_eq!(walk_threads(), 3);
        std::env::set_var("KROMA_WALK_THREADS", "100");
        assert_eq!(walk_threads(), 100);

        // A non-numeric value falls back to the computed default.
        std::env::set_var("KROMA_WALK_THREADS", "not-a-number");
        assert!((8..=32).contains(&walk_threads()));

        std::env::remove_var("KROMA_WALK_THREADS");
    }

    fn temp_scan_dir() -> kroma_testing::TempDir {
        kroma_testing::temp_dir("scanroot")
    }

    struct ScanOutcome {
        items: HashMap<String, MediaItem>,
        shows: HashMap<String, Show>,
        mtimes: HashMap<String, Option<i64>>,
        item_ids: HashSet<String>,
        movie_seen: bool,
        episode_seen: bool,
        unreadable: usize,
    }

    fn scan_into(lib_id: &str, root: &Path) -> ScanOutcome {
        let mut items = HashMap::new();
        let mut shows = HashMap::new();
        let mut mtimes = HashMap::new();
        let mut item_ids = HashSet::new();
        let mut movie_seen = false;
        let mut episode_seen = false;

        let unreadable = scan_root(
            lib_id,
            root,
            &mut items,
            &mut shows,
            &mut mtimes,
            &mut item_ids,
            &mut movie_seen,
            &mut episode_seen,
        );

        ScanOutcome {
            items,
            shows,
            mtimes,
            item_ids,
            movie_seen,
            episode_seen,
            unreadable,
        }
    }

    #[test]
    fn scan_root_groups_movies_and_episodes_and_skips_noise() {
        let root_dir = temp_scan_dir();
        let root = root_dir.path();
        // One movie (year in filename), a show with two episodes in its own folder,
        // a non-video file, and a hidden dir that must be pruned from the descent.
        std::fs::write(root.join("The Matrix (1999).mkv"), b"x").unwrap();
        let show_dir = root.join("Breaking Bad");
        std::fs::create_dir_all(&show_dir).unwrap();
        std::fs::write(show_dir.join("Breaking Bad S01E01.mkv"), b"x").unwrap();
        std::fs::write(show_dir.join("Breaking Bad S01E02.mkv"), b"x").unwrap();
        std::fs::write(root.join("poster.jpg"), b"x").unwrap();
        let hidden = root.join(".hidden");
        std::fs::create_dir_all(&hidden).unwrap();
        std::fs::write(hidden.join("Ghost (2000).mkv"), b"x").unwrap();

        let scan = scan_into("lib1", root);

        assert!(scan.movie_seen);
        assert!(scan.episode_seen);
        // 1 movie + 2 episodes = 3 logical items; jpg and hidden dir ignored.
        assert_eq!(scan.items.len(), 3, "movie + 2 episodes, noise excluded");
        assert_eq!(scan.shows.len(), 1, "both episodes grouped under one show");
        assert_eq!(scan.item_ids.len(), 3);
        assert_eq!(
            scan.mtimes.len(),
            3,
            "an mtime is recorded per scanned file"
        );

        let movie = scan.items.values().find(|i| i.kind == Kind::Movie).unwrap();
        assert_eq!(movie.title, "The Matrix");
        assert_eq!(movie.year, Some(1999));
        assert_eq!(movie.files.len(), 1);
        assert_eq!(movie.library, "lib1");

        let show = scan.shows.values().next().unwrap();
        assert_eq!(show.title, "Breaking Bad");
        let episodes: Vec<&MediaItem> = scan
            .items
            .values()
            .filter(|i| i.kind == Kind::Episode)
            .collect();
        assert_eq!(episodes.len(), 2);
        assert!(episodes
            .iter()
            .all(|e| e.show_id.as_deref() == Some(show.id.as_str())));
    }

    #[test]
    fn a_directory_symlinked_to_itself_is_walked_once() {
        let root_dir = temp_scan_dir();
        let root = root_dir.path();
        std::fs::write(root.join("The Matrix (1999).mkv"), b"x").unwrap();
        std::os::unix::fs::symlink(".", root.join("loop")).unwrap();

        let scan = scan_into("lib1", root);

        assert_eq!(scan.items.len(), 1);
        assert_eq!(
            scan.items.values().next().unwrap().files.len(),
            1,
            "the loop yielded the file again"
        );
    }

    #[test]
    fn a_library_of_symlinks_indexes_what_they_point_at() {
        let root_dir = temp_scan_dir();
        let base = root_dir.path();
        let dump = base.join("dump");
        std::fs::create_dir_all(&dump).unwrap();
        std::fs::write(dump.join("The Matrix (1999).mkv"), b"x").unwrap();
        std::fs::write(dump.join("Breaking.Bad.S01E01.mkv"), b"x").unwrap();
        std::fs::write(dump.join("Breaking.Bad.S01E02.mkv"), b"x").unwrap();
        let root = base.join("4k Movies");
        std::fs::create_dir_all(&root).unwrap();
        for name in [
            "The Matrix (1999).mkv",
            "Breaking.Bad.S01E01.mkv",
            "Breaking.Bad.S01E02.mkv",
        ] {
            std::os::unix::fs::symlink(dump.join(name), root.join(name)).unwrap();
        }

        let scan = scan_into("lib1", &root);

        assert_eq!(scan.unreadable, 0);
        assert_eq!(scan.items.len(), 3);
        assert_eq!(scan.shows.len(), 1, "both episodes grouped under one show");
        let matrix = scan
            .items
            .values()
            .find(|i| i.kind == Kind::Movie)
            .expect("the symlinked movie is indexed");
        assert_eq!(matrix.files[0].size, Some(1), "the target was stat-ed");
    }

    #[test]
    fn a_symlinked_folder_of_episodes_groups_them_by_filename() {
        let root_dir = temp_scan_dir();
        let base = root_dir.path();
        let dump = base.join("dump");
        std::fs::create_dir_all(&dump).unwrap();
        std::fs::write(dump.join("Breaking.Bad.S01E01.mkv"), b"x").unwrap();
        std::fs::write(dump.join("Breaking.Bad.S01E02.mkv"), b"x").unwrap();
        std::fs::write(dump.join("The.Office.S01E01.mkv"), b"x").unwrap();
        let root = base.join("4k Shows");
        std::fs::create_dir_all(&root).unwrap();
        std::os::unix::fs::symlink(&dump, root.join("all")).unwrap();

        let scan = scan_into("lib1", &root);

        let mut titles: Vec<&str> = scan.shows.values().map(|s| s.title.as_str()).collect();
        titles.sort_unstable();
        assert_eq!(titles, ["Breaking Bad", "The Office"]);
        assert_eq!(scan.items.len(), 3);
    }

    #[test]
    fn a_symlink_whose_target_is_gone_is_counted_rather_than_dropped() {
        let root_dir = temp_scan_dir();
        let root = root_dir.path();
        std::fs::write(root.join("The Matrix (1999).mkv"), b"x").unwrap();
        std::os::unix::fs::symlink("/nowhere/Gone (2014).mkv", root.join("Gone (2014).mkv"))
            .unwrap();
        std::os::unix::fs::symlink("/nowhere/shows", root.join("Shows")).unwrap();

        let scan = scan_into("lib1", root);

        assert_eq!(scan.unreadable, 2);
        assert_eq!(scan.items.len(), 1, "only the real file is indexed");
    }

    #[test]
    fn scan_root_untitled_movie_gets_placeholder_title() {
        let root_dir = temp_scan_dir();
        let root = root_dir.path();
        // A bare numeric/year-only name parses to an empty movie title, which
        // index_parsed replaces with "Untitled".
        std::fs::write(root.join("1999.mkv"), b"x").unwrap();

        let scan = scan_into("lib1", root);

        assert!(scan.movie_seen);
        assert!(!scan.episode_seen);
        assert_eq!(scan.items.len(), 1);
        assert_eq!(scan.items.values().next().unwrap().title, "Untitled");
    }
}
