use super::*;

use super::super::tests::user_with;

// The name carries a counter as well as the pid: `cargo test` runs these in
// threads of one process, so a pid alone collides between two tests here.
struct Tree(PathBuf);

impl Tree {
    fn new(name: &str) -> Self {
        use std::sync::atomic::{AtomicU32, Ordering};
        static N: AtomicU32 = AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "kroma-browse-{name}-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn dir(&self, name: &str) -> PathBuf {
        let p = self.0.join(name);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    fn file(&self, name: &str) -> PathBuf {
        let p = self.0.join(name);
        std::fs::write(&p, b"x").unwrap();
        p
    }

    fn path(&self) -> String {
        self.0.to_string_lossy().to_string()
    }
}

impl Drop for Tree {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn names(body: &Value) -> Vec<String> {
    body["entries"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["name"].as_str().unwrap().to_string())
        .collect()
}

fn browse(path: &str) -> Value {
    browse_dirs(path.to_string()).unwrap_or_else(|_| panic!("{path} did not browse"))
}

#[test]
fn only_directories_are_offered() {
    let t = Tree::new("dirs-only");
    t.dir("Films");
    t.dir("Series");
    t.file("readme.txt");
    t.file("poster.jpg");

    assert_eq!(names(&browse(&t.path())), ["Films", "Series"]);
}

#[test]
fn synology_system_directories_are_hidden() {
    let t = Tree::new("system");
    t.dir("Films");
    t.dir("@eaDir");
    t.dir("#recycle");
    t.dir(".DS_Store_dir");

    assert_eq!(names(&browse(&t.path())), ["Films"]);
}

#[test]
fn entries_are_sorted_the_way_a_human_reads_them() {
    let t = Tree::new("sort");
    for name in ["Zik", "anime", "Films", "docs"] {
        t.dir(name);
    }

    assert_eq!(names(&browse(&t.path())), ["anime", "docs", "Films", "Zik"]);
}

#[test]
fn an_entry_carries_the_full_path_the_scanner_will_use() {
    let t = Tree::new("entry");
    let films = t.dir("Films");

    let body = browse(&t.path());
    let entry = &body["entries"][0];
    assert_eq!(entry["name"], "Films");
    assert_eq!(
        entry["path"].as_str().unwrap(),
        films.canonicalize().unwrap().to_string_lossy()
    );
}

#[test]
fn the_path_returned_is_the_resolved_one_not_the_one_asked_for() {
    // macOS hands out `/var/...` symlinks for temp dirs, and a NAS share is
    // routinely a link into `/volume1`.
    let t = Tree::new("canon");
    t.dir("Films");
    let asked = format!("{}/./Films/..", t.path());

    let body = browse(&asked);
    assert_eq!(
        body["path"].as_str().unwrap(),
        t.0.canonicalize().unwrap().to_string_lossy()
    );
}

#[test]
fn a_child_points_back_at_its_parent_so_the_picker_can_go_up() {
    let t = Tree::new("parent");
    let films = t.dir("Films");
    t.dir("Films/2024");

    let body = browse(&films.to_string_lossy());
    assert_eq!(names(&body), ["2024"]);
    assert_eq!(
        body["parent"].as_str().unwrap(),
        t.0.canonicalize().unwrap().to_string_lossy()
    );
}

#[test]
fn browsing_with_no_path_lands_on_a_root_with_nowhere_above_it() {
    let body = browse("");
    assert!(body["parent"].is_null(), "{body}");
    // Either the Synology volumes (path "") or the dev fallback ("/").
    let path = body["path"].as_str().unwrap();
    assert!(path.is_empty() || path == "/", "{path}");
}

#[test]
fn a_directory_that_is_not_there_is_a_miss_not_an_empty_folder() {
    let t = Tree::new("missing");
    assert!(matches!(
        browse_dirs(format!("{}/nope", t.path())),
        Err(BrowseErr::NotFound)
    ));
}

#[test]
fn a_file_is_a_miss_too() {
    let t = Tree::new("file");
    let f = t.file("movie.mkv");
    assert!(matches!(
        browse_dirs(f.to_string_lossy().to_string()),
        Err(BrowseErr::NotFound)
    ));
}

#[test]
fn an_empty_directory_browses_to_an_empty_list() {
    let t = Tree::new("empty");
    let body = browse(&t.path());
    assert_eq!(body["entries"].as_array().unwrap().len(), 0);
}

#[test]
fn with_volumes_present_the_browse_cannot_leave_them() {
    let roots = vec![PathBuf::from("/volume1"), PathBuf::from("/volumeUSB1")];
    assert!(within_roots(Path::new("/volume1/video/Films"), &roots));
    assert!(within_roots(Path::new("/volumeUSB1"), &roots));
    assert!(!within_roots(Path::new("/etc"), &roots));
    assert!(!within_roots(Path::new("/"), &roots));
    assert!(!within_roots(Path::new("/root/.ssh"), &roots));
}

#[test]
fn a_path_that_merely_starts_with_a_root_name_is_not_inside_it() {
    // `starts_with` on a Path compares whole components; a string prefix
    // check would let these through.
    let roots = vec![PathBuf::from("/volume1")];
    assert!(!within_roots(Path::new("/volume10/video"), &roots));
    assert!(!within_roots(Path::new("/volume1x"), &roots));
}

#[test]
fn with_no_volumes_at_all_the_dev_box_may_browse_anywhere() {
    assert!(within_roots(Path::new("/etc"), &[]));
}

#[tokio::test]
async fn browsing_needs_the_library_permission() {
    // The picker enumerates the host filesystem, so it is gated on library
    // management rather than on merely being some kind of admin.
    let user = user_with(vec![Permission::Playback, Permission::UsersManage]);
    let err = browse_libraries(AuthUser(user), Query(BrowseQuery { path: None }))
        .await
        .unwrap_err();
    assert_eq!(err.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn a_traversal_segment_is_refused_before_the_filesystem_is_touched() {
    // `canonicalize` would resolve `..`, and the confinement check then
    // passes on a dev box with no volumes.
    let user = user_with(vec![Permission::LibraryManage]);
    let err = browse_libraries(
        AuthUser(user),
        Query(BrowseQuery {
            path: Some("/volume1/video/../../etc".into()),
        }),
    )
    .await
    .unwrap_err();
    assert_eq!(err.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn a_real_folder_comes_back_as_a_listing() {
    let t = Tree::new("handler-ok");
    t.dir("Films");
    let user = user_with(vec![Permission::LibraryManage]);

    let res = browse_libraries(
        AuthUser(user),
        Query(BrowseQuery {
            path: Some(t.path()),
        }),
    )
    .await
    .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
}

#[tokio::test]
async fn a_folder_that_is_not_there_answers_404() {
    let t = Tree::new("handler-404");
    let user = user_with(vec![Permission::LibraryManage]);

    let err = browse_libraries(
        AuthUser(user),
        Query(BrowseQuery {
            path: Some(format!("{}/nope", t.path())),
        }),
    )
    .await
    .unwrap_err();
    assert_eq!(err.status(), StatusCode::NOT_FOUND);
}
