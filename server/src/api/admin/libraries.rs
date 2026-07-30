//! Library CRUD and rescans. Edits persist to the settings store and kick a
//! background rescan so the catalogue reflects the change.

use std::path::{Path, PathBuf};

use axum::extract::{Path as AxPath, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::api::error::lerr;
use crate::api::util::query;
use crate::api::extract::AuthUser;
use crate::db;
use crate::infra::events::ServerEvent;
use crate::model::Permission;
use crate::services::settings::{self, LibraryDef};
use crate::state::SharedState;
use axum::routing::{get, patch, post};
use axum::Router;

/// Paths are relative to the `/api/admin` nest.
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/libraries", get(list_libraries).post(create_library))
        .route("/libraries/browse", get(browse_libraries))
        .route("/libraries/{id}", patch(update_library).delete(delete_library))
        .route("/libraries/{id}/scan", post(scan_library))
}

pub async fn list_libraries(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    let defs = settings::library_defs(&state.settings, &state.config);
    let stats = query(&state.db, move |pool| db::library_stats(&pool)).await?;
    let last_scan = crate::services::activity::snapshot(&state.activity).last_scan_at;

    let libraries: Vec<crate::api::dto::AdminLibrary> = defs
        .iter()
        .map(|d| {
            let st = stats.iter().find(|s| s.id == d.id);
            crate::api::dto::AdminLibrary {
                id: d.id.clone(),
                name: d.name.clone(),
                kind: kind_label(d, st),
                folders: d.folders.clone(),
                item_count: st.map(|s| s.item_count).unwrap_or(0),
                size_bytes: st.map(|s| s.total_bytes).unwrap_or(0),
                last_scan: last_scan.clone(),
                auto_scan: d.auto_scan,
            }
        })
        .collect();
    Ok(Json(json!({ "libraries": libraries })).into_response())
}

fn kind_label(def: &LibraryDef, _st: Option<&crate::model::LibraryStat>) -> String {
    match def.kind.as_str() {
        "shows" => "tv",
        "movies" => "film",
        "music" => "music",
        "photo" => "photo",
        _ => "film",
    }
    .to_string()
}

#[derive(Debug, Deserialize)]
pub struct BrowseQuery {
    #[serde(default)]
    pub path: Option<String>,
}

/// Browseable sub-directories of `path`, as `{ path, parent, entries: [{ name,
/// path }] }`. With no `path`, the roots: Synology `volumeN` dirs, else `/`.
pub async fn browse_libraries(
    AuthUser(user): AuthUser,
    Query(q): Query<BrowseQuery>,
) -> Result<Response, Response> {
    super::require(&user, Permission::LibraryManage)?;
    let raw = q.path.unwrap_or_default();
    // Never resolve a traversal segment, even before touching the filesystem.
    if raw.contains("..") {
        return Err(lerr(super::user_locale(&user), StatusCode::FORBIDDEN, "error.forbidden"));
    }
    match tokio::task::spawn_blocking(move || browse_dirs(raw)).await {
        Ok(Ok(body)) => Ok(Json(body).into_response()),
        Ok(Err(BrowseErr::Forbidden)) => {
            Err(lerr(super::user_locale(&user), StatusCode::FORBIDDEN, "error.forbidden"))
        }
        Ok(Err(BrowseErr::NotFound)) => {
            Err(lerr(super::user_locale(&user), StatusCode::NOT_FOUND, "error.itemNotFound"))
        }
        Err(_) => Err(lerr(super::user_locale(&user), StatusCode::INTERNAL_SERVER_ERROR, "error.internal")),
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateLibraryBody {
    pub name: String,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub folders: Vec<String>,
}

pub async fn create_library(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateLibraryBody>,
) -> Result<Response, Response> {
    super::require(&user, Permission::LibraryManage)?;
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err(lerr(super::user_locale(&user), StatusCode::BAD_REQUEST, "admin.nameRequired"));
    }
    let mut defs = settings::library_defs(&state.settings, &state.config);
    let id = crate::services::scan::short_hash(&format!("lib|{name}|{}", crate::services::auth::random_token()));
    defs.push(LibraryDef {
        id: id.clone(),
        name,
        kind: body.kind.unwrap_or_default(),
        folders: clean_folders(body.folders),
        auto_scan: true,
    });
    settings::set_library_defs(&state.settings, &state.db, &defs);
    spawn_rescan(state.clone());
    Ok(Json(json!({ "id": id })).into_response())
}

#[derive(Debug, Deserialize)]
pub struct UpdateLibraryBody {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub folders: Option<Vec<String>>,
    #[serde(rename = "autoScan", default)]
    pub auto_scan: Option<bool>,
}

pub async fn update_library(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
    Json(body): Json<UpdateLibraryBody>,
) -> Result<Response, Response> {
    super::require(&user, Permission::LibraryManage)?;
    let mut defs = settings::library_defs(&state.settings, &state.config);
    let Some(def) = defs.iter_mut().find(|d| d.id == id) else {
        return Err(lerr(super::user_locale(&user), StatusCode::NOT_FOUND, "error.libraryNotFound"));
    };
    let mut needs_scan = false;
    if let Some(name) = body.name.filter(|n| !n.trim().is_empty()) {
        def.name = name.trim().to_string();
    }
    if let Some(kind) = body.kind {
        def.kind = kind;
    }
    if let Some(folders) = body.folders {
        def.folders = clean_folders(folders);
        needs_scan = true;
    }
    if let Some(auto) = body.auto_scan {
        def.auto_scan = auto;
    }
    settings::set_library_defs(&state.settings, &state.db, &defs);
    if needs_scan {
        spawn_rescan(state.clone());
    }
    state.events.publish(ServerEvent::LibraryUpdated);
    Ok(StatusCode::NO_CONTENT.into_response())
}

/// The vanished library and its items are cascade-deleted by the diff-sync.
pub async fn delete_library(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
) -> Result<Response, Response> {
    super::require(&user, Permission::LibraryManage)?;
    let mut defs = settings::library_defs(&state.settings, &state.config);
    let before = defs.len();
    defs.retain(|d| d.id != id);
    if defs.len() == before {
        return Err(lerr(super::user_locale(&user), StatusCode::NOT_FOUND, "error.libraryNotFound"));
    }
    settings::set_library_defs(&state.settings, &state.db, &defs);
    spawn_rescan(state.clone());
    Ok(StatusCode::NO_CONTENT.into_response())
}

/// Kicks a full rescan, whichever library id is named.
pub async fn scan_library(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    AxPath(_id): AxPath<String>,
) -> Result<Response, Response> {
    super::require(&user, Permission::LibraryManage)?;
    spawn_rescan(state.clone());
    Ok(Json(json!({ "started": true })).into_response())
}

enum BrowseErr {
    Forbidden,
    NotFound,
}

fn browse_dirs(raw: String) -> Result<Value, BrowseErr> {
    let roots = volume_roots();
    let raw = raw.trim();

    if raw.is_empty() {
        if !roots.is_empty() {
            return Ok(json!({ "path": "", "parent": Value::Null, "entries": to_entries(roots) }));
        }
        let entries = read_subdirs(Path::new("/"))?;
        return Ok(json!({ "path": "/", "parent": Value::Null, "entries": entries }));
    }

    let canon = std::fs::canonicalize(raw).map_err(|_| BrowseErr::NotFound)?;
    if !canon.is_dir() {
        return Err(BrowseErr::NotFound);
    }
    if !within_roots(&canon, &roots) {
        return Err(BrowseErr::Forbidden);
    }

    let entries = read_subdirs(&canon)?;
    let is_root = canon == Path::new("/") || roots.contains(&canon);
    let parent = if is_root {
        Value::Null
    } else {
        canon
            .parent()
            .map(|p| Value::String(p.to_string_lossy().to_string()))
            .unwrap_or(Value::Null)
    };
    Ok(json!({ "path": canon.to_string_lossy(), "parent": parent, "entries": entries }))
}

// Confines the browse to the volume roots; with none (a dev box, not a DSM
// one) anywhere is allowed.
fn within_roots(path: &Path, roots: &[PathBuf]) -> bool {
    roots.is_empty() || roots.iter().any(|r| path.starts_with(r))
}

fn volume_roots() -> Vec<PathBuf> {
    std::fs::read_dir("/")
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.is_dir()
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("volume"))
                    .unwrap_or(false)
        })
        .collect()
}

// Skips hidden and DSM system names (`@eaDir`, `#recycle`).
fn read_subdirs(dir: &Path) -> Result<Vec<Value>, BrowseErr> {
    let rd = std::fs::read_dir(dir).map_err(|_| BrowseErr::NotFound)?;
    let mut dirs: Vec<PathBuf> = Vec::new();
    for entry in rd.flatten() {
        let name = entry.file_name();
        if name.to_string_lossy().starts_with(['.', '@', '#']) {
            continue;
        }
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false) || entry.path().is_dir();
        if is_dir {
            dirs.push(entry.path());
        }
    }
    Ok(to_entries(dirs))
}

fn to_entries(mut paths: Vec<PathBuf>) -> Vec<Value> {
    paths.sort_by_key(|p| p.file_name().unwrap_or_default().to_string_lossy().to_lowercase());
    paths
        .iter()
        .map(|p| {
            json!({
                "name": p.file_name().and_then(|n| n.to_str()).unwrap_or_default(),
                "path": p.to_string_lossy(),
            })
        })
        .collect()
}

fn clean_folders(folders: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    folders
        .into_iter()
        .map(|f| f.trim().to_string())
        .filter(|f| !f.is_empty() && seen.insert(f.clone()))
        .collect()
}

// Goes through the job manager so it shares the `library.scan` single-flight
// guard and its follow-up pipeline; a no-op when a scan is already running.
fn spawn_rescan(state: SharedState) {
    let _ = state.jobs.trigger(state.clone(), crate::services::jobs::JobKey("library.scan"), "library-edit");
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::model::User;

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

    fn user_with(permissions: Vec<Permission>) -> User {
        User {
            id: "u1".into(),
            email: "a@b.c".into(),
            username: "admin".into(),
            avatar_url: None,
            language: None,
            audio_language: None,
            subtitle_language: None,
            permissions,
            created_at: "2024-01-01T00:00:00Z".into(),
            has_pin: false,
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

    fn admin() -> User {
        user_with(vec![Permission::LibraryManage])
    }

    // Returns the whole `TestApp`, not just its `state`: the harness owns the
    // data directory's `TempDir`, and keeping only `state` drops it early.
    fn app() -> crate::api::test_support::TestApp {
        crate::api::test_support::test_app()
    }

    fn defs(state: &SharedState) -> Vec<LibraryDef> {
        settings::library_defs(&state.settings, &state.config)
    }

    async fn create(state: &SharedState, name: &str, folders: Vec<&str>) -> Result<String, Response> {
        let body = CreateLibraryBody {
            name: name.into(),
            kind: Some("movies".into()),
            folders: folders.into_iter().map(String::from).collect(),
        };
        let res = create_library(State(state.clone()), AuthUser(admin()), Json(body)).await?;
        assert_eq!(res.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
        let v: Value = serde_json::from_slice(&bytes).unwrap();
        Ok(v["id"].as_str().unwrap().to_string())
    }

    #[test]
    fn folder_lists_are_trimmed_deduped_and_stripped_of_blanks() {
        assert_eq!(
            clean_folders(vec![
                "  /media/movies  ".into(),
                "".into(),
                "   ".into(),
                "/media/movies".into(),
                "/media/shows".into(),
            ]),
            ["/media/movies", "/media/shows"]
        );
    }

    #[test]
    fn the_first_spelling_of_a_folder_is_the_one_kept() {
        assert_eq!(clean_folders(vec![" /a ".into(), "/a".into(), "/b".into()]), ["/a", "/b"]);
    }

    #[test]
    fn a_list_of_nothing_stays_a_list_of_nothing() {
        assert!(clean_folders(Vec::new()).is_empty());
        assert!(clean_folders(vec!["".into(), "  ".into()]).is_empty());
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
        assert_eq!(entry["path"].as_str().unwrap(), films.canonicalize().unwrap().to_string_lossy());
    }

    #[test]
    fn the_path_returned_is_the_resolved_one_not_the_one_asked_for() {
        // macOS hands out `/var/...` symlinks for temp dirs, and a NAS share is
        // routinely a link into `/volume1`.
        let t = Tree::new("canon");
        t.dir("Films");
        let asked = format!("{}/./Films/..", t.path());

        let body = browse(&asked);
        assert_eq!(body["path"].as_str().unwrap(), t.0.canonicalize().unwrap().to_string_lossy());
    }

    #[test]
    fn a_child_points_back_at_its_parent_so_the_picker_can_go_up() {
        let t = Tree::new("parent");
        let films = t.dir("Films");
        t.dir("Films/2024");

        let body = browse(&films.to_string_lossy());
        assert_eq!(names(&body), ["2024"]);
        assert_eq!(body["parent"].as_str().unwrap(), t.0.canonicalize().unwrap().to_string_lossy());
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
        assert!(matches!(browse_dirs(f.to_string_lossy().to_string()), Err(BrowseErr::NotFound)));
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
            Query(BrowseQuery { path: Some("/volume1/video/../../etc".into()) }),
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

        let res = browse_libraries(AuthUser(user), Query(BrowseQuery { path: Some(t.path()) }))
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
            Query(BrowseQuery { path: Some(format!("{}/nope", t.path())) }),
        )
        .await
        .unwrap_err();
        assert_eq!(err.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn a_created_library_persists_with_its_folders_cleaned() {
        let harness = app();
        let state = harness.state.clone();
        let id = create(&state, "  Films  ", vec![" /media/films ", "", "/media/films"])
            .await
            .unwrap();

        let saved = defs(&state);
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].id, id);
        assert_eq!(saved[0].name, "Films");
        assert_eq!(saved[0].folders, ["/media/films"]);
        assert_eq!(saved[0].kind, "movies");
        assert!(saved[0].auto_scan);
    }

    #[tokio::test]
    async fn every_library_gets_its_own_id() {
        let harness = app();
        let state = harness.state.clone();
        let a = create(&state, "Films", vec!["/a"]).await.unwrap();
        let b = create(&state, "Films", vec!["/b"]).await.unwrap();
        assert_ne!(a, b);
        assert_eq!(defs(&state).len(), 2);
    }

    #[tokio::test]
    async fn a_library_needs_a_name() {
        let harness = app();
        let state = harness.state.clone();
        for blank in ["", "   "] {
            let body = CreateLibraryBody { name: blank.into(), kind: None, folders: Vec::new() };
            let err = create_library(State(state.clone()), AuthUser(admin()), Json(body))
                .await
                .unwrap_err();
            assert_eq!(err.status(), StatusCode::BAD_REQUEST);
        }
        assert!(defs(&state).is_empty(), "a rejected create must not persist anything");
    }

    #[tokio::test]
    async fn creating_a_library_needs_the_permission() {
        let harness = app();
        let state = harness.state.clone();
        let body = CreateLibraryBody { name: "Films".into(), kind: None, folders: Vec::new() };
        let err = create_library(
            State(state.clone()),
            AuthUser(user_with(vec![Permission::Playback, Permission::UsersManage])),
            Json(body),
        )
        .await
        .unwrap_err();
        assert_eq!(err.status(), StatusCode::FORBIDDEN);
        assert!(defs(&state).is_empty());
    }

    #[tokio::test]
    async fn an_update_touches_only_the_fields_it_names() {
        let harness = app();
        let state = harness.state.clone();
        let id = create(&state, "Films", vec!["/media/films"]).await.unwrap();

        let body = UpdateLibraryBody {
            name: Some("Cinéma".into()),
            kind: None,
            folders: None,
            auto_scan: None,
        };
        let res =
            update_library(State(state.clone()), AuthUser(admin()), AxPath(id), Json(body))
                .await
                .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);

        let saved = &defs(&state)[0];
        assert_eq!(saved.name, "Cinéma");
        assert_eq!(saved.kind, "movies");
        assert_eq!(saved.folders, ["/media/films"]);
        assert!(saved.auto_scan);
    }

    #[tokio::test]
    async fn an_update_can_turn_auto_scan_off_without_touching_anything_else() {
        let harness = app();
        let state = harness.state.clone();
        let id = create(&state, "Films", vec!["/media/films"]).await.unwrap();

        let body = UpdateLibraryBody {
            name: None,
            kind: None,
            folders: None,
            auto_scan: Some(false),
        };
        update_library(State(state.clone()), AuthUser(admin()), AxPath(id), Json(body))
            .await
            .unwrap();

        let saved = &defs(&state)[0];
        assert!(!saved.auto_scan);
        assert_eq!(saved.name, "Films");
    }

    #[tokio::test]
    async fn a_blank_new_name_is_ignored_rather_than_applied() {
        let harness = app();
        let state = harness.state.clone();
        let id = create(&state, "Films", vec!["/media/films"]).await.unwrap();

        let body = UpdateLibraryBody {
            name: Some("   ".into()),
            kind: None,
            folders: None,
            auto_scan: None,
        };
        update_library(State(state.clone()), AuthUser(admin()), AxPath(id), Json(body))
            .await
            .unwrap();

        assert_eq!(defs(&state)[0].name, "Films");
    }

    #[tokio::test]
    async fn replacing_the_folders_cleans_them_too() {
        let harness = app();
        let state = harness.state.clone();
        let id = create(&state, "Films", vec!["/media/films"]).await.unwrap();

        let body = UpdateLibraryBody {
            name: None,
            kind: Some("shows".into()),
            folders: Some(vec![" /media/shows ".into(), "".into(), "/media/shows".into()]),
            auto_scan: None,
        };
        update_library(State(state.clone()), AuthUser(admin()), AxPath(id), Json(body))
            .await
            .unwrap();

        let saved = &defs(&state)[0];
        assert_eq!(saved.folders, ["/media/shows"]);
        assert_eq!(saved.kind, "shows");
    }

    #[tokio::test]
    async fn editing_a_library_that_is_not_there_is_a_404() {
        let harness = app();
        let state = harness.state.clone();
        create(&state, "Films", vec!["/media/films"]).await.unwrap();

        let body = UpdateLibraryBody {
            name: Some("Ghost".into()),
            kind: None,
            folders: None,
            auto_scan: None,
        };
        let err = update_library(
            State(state.clone()),
            AuthUser(admin()),
            AxPath("no-such-library".into()),
            Json(body),
        )
        .await
        .unwrap_err();
        assert_eq!(err.status(), StatusCode::NOT_FOUND);

        let saved = defs(&state);
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].name, "Films");
    }

    #[tokio::test]
    async fn deleting_removes_that_library_and_leaves_the_others() {
        let harness = app();
        let state = harness.state.clone();
        let films = create(&state, "Films", vec!["/media/films"]).await.unwrap();
        let shows = create(&state, "Séries", vec!["/media/shows"]).await.unwrap();

        let res = delete_library(State(state.clone()), AuthUser(admin()), AxPath(films))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);

        let saved = defs(&state);
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].id, shows);
    }

    #[tokio::test]
    async fn deleting_a_library_that_is_not_there_is_a_404() {
        let harness = app();
        let state = harness.state.clone();
        create(&state, "Films", vec!["/media/films"]).await.unwrap();
        let err =
            delete_library(State(state.clone()), AuthUser(admin()), AxPath("ghost".into()))
                .await
                .unwrap_err();
        assert_eq!(err.status(), StatusCode::NOT_FOUND);
        assert_eq!(defs(&state).len(), 1);
    }

    #[tokio::test]
    async fn deleting_needs_the_permission() {
        let harness = app();
        let state = harness.state.clone();
        let id = create(&state, "Films", vec!["/media/films"]).await.unwrap();
        let err = delete_library(
            State(state.clone()),
            AuthUser(user_with(vec![Permission::Playback])),
            AxPath(id),
        )
        .await
        .unwrap_err();
        assert_eq!(err.status(), StatusCode::FORBIDDEN);
        assert_eq!(defs(&state).len(), 1, "a refused delete must not remove anything");
    }

    #[tokio::test]
    async fn a_scan_can_be_kicked_by_hand_and_is_gated() {
        let harness = app();
        let state = harness.state.clone();
        let res = scan_library(State(state.clone()), AuthUser(admin()), AxPath("any".into()))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        let err = scan_library(
            State(state.clone()),
            AuthUser(user_with(vec![Permission::Playback])),
            AxPath("any".into()),
        )
        .await
        .unwrap_err();
        assert_eq!(err.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn the_list_reports_every_library_with_a_zeroed_card() {
        let harness = app();
        let state = harness.state.clone();
        create(&state, "Films", vec!["/media/films"]).await.unwrap();

        let res = list_libraries(State(state.clone()), AuthUser(admin())).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
        let v: Value = serde_json::from_slice(&bytes).unwrap();

        let libs = v["libraries"].as_array().unwrap();
        assert_eq!(libs.len(), 1);
        assert_eq!(libs[0]["name"], "Films");
        assert_eq!(libs[0]["kind"], "film");
        assert_eq!(libs[0]["itemCount"], 0);
        assert_eq!(libs[0]["sizeBytes"], 0);
        assert_eq!(libs[0]["autoScan"], true);
    }

    #[tokio::test]
    async fn the_list_is_open_to_any_admin_not_just_a_library_manager() {
        let harness = app();
        let state = harness.state.clone();
        let res =
            list_libraries(State(state.clone()), AuthUser(user_with(vec![Permission::UsersManage])))
                .await
                .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        let err =
            list_libraries(State(state.clone()), AuthUser(user_with(vec![Permission::Playback])))
                .await
                .unwrap_err();
        assert_eq!(err.status(), StatusCode::FORBIDDEN);
    }

    #[test]
    fn a_library_kind_becomes_the_icon_the_card_renders() {
        let of = |kind: &str| {
            kind_label(
                &LibraryDef {
                    id: "l1".into(),
                    name: "L".into(),
                    kind: kind.into(),
                    folders: Vec::new(),
                    auto_scan: true,
                },
                None,
            )
        };
        assert_eq!(of("shows"), "tv");
        assert_eq!(of("movies"), "film");
        assert_eq!(of("music"), "music");
        assert_eq!(of("photo"), "photo");
        assert_eq!(of(""), "film");
        assert_eq!(of("something-new"), "film");
    }
}
