use super::*;
use crate::model::Kind;
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
    std::os::unix::fs::symlink("/nowhere/Gone (2014).mkv", root.join("Gone (2014).mkv")).unwrap();
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
