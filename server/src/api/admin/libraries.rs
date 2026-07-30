//! Library management: list / create / update / delete libraries and trigger
//! rescans. Library edits persist to the settings store and kick a background
//! rescan so the catalogue reflects the change.

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

/// Admin library management. Paths are relative to the `/api/admin` nest.
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/libraries", get(list_libraries).post(create_library))
        .route("/libraries/browse", get(browse_libraries))
        .route("/libraries/{id}", patch(update_library).delete(delete_library))
        .route("/libraries/{id}/scan", post(scan_library))
}

/// `GET /api/admin/libraries` → library cards (folders, size, item count).
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

/// `GET /api/admin/libraries/browse?path=<abs>` → list the browseable
/// sub-directories of `path` so the admin UI can pick library folders off the
/// NAS filesystem instead of typing paths. With no `path`, returns the roots
/// (Synology `volumeN` dirs; falls back to `/` on a dev box with no volumes).
///
/// Response JSON:
/// `{ "path": "<current abs path|\"\">", "parent": "<abs path>"|null,
///    "entries": [ { "name": "Films", "path": "/volume1/video/Films" }, … ] }`
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

/// `POST /api/admin/libraries` → add a library, then rescan.
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

/// `PATCH /api/admin/libraries/:id` → rename / change folders / toggle auto-scan.
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

/// `DELETE /api/admin/libraries/:id` → remove a library and rescan (the vanished
/// library + its items are cascade-deleted by the diff-sync).
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

/// `POST /api/admin/libraries/:id/scan` (and any library) → kick a full rescan.
pub async fn scan_library(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    AxPath(_id): AxPath<String>,
) -> Result<Response, Response> {
    super::require(&user, Permission::LibraryManage)?;
    spawn_rescan(state.clone());
    Ok(Json(json!({ "started": true })).into_response())
}

/// Filesystem-browse failure, mapped to an HTTP status by `browse_libraries`.
enum BrowseErr {
    /// Path escapes the allowed volume roots (403).
    Forbidden,
    /// Path is missing or not a directory (404).
    NotFound,
}

/// Blocking directory walk backing `GET /libraries/browse`. Runs on a
/// `spawn_blocking` thread. See `browse_libraries` for the response shape.
fn browse_dirs(raw: String) -> Result<Value, BrowseErr> {
    let roots = volume_roots();
    let raw = raw.trim();

    // No path → the roots: Synology volumes, or `/` on a dev machine with none.
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

/// Whether `path` is inside the area an admin may browse: under one of `roots`,
/// or anywhere at all when there are none (a dev box with no Synology volumes).
///
/// Split out of `browse_dirs` because it is the rule that keeps the browse off
/// the rest of the NAS - `/etc`, another user's home - and `volume_roots()` reads
/// the real `/`, so on anything but a DSM box the confining branch is otherwise
/// dead code that no test can reach.
fn within_roots(path: &Path, roots: &[PathBuf]) -> bool {
    roots.is_empty() || roots.iter().any(|r| path.starts_with(r))
}

/// Top-level `/` directories named `volume…` (Synology `/volume1`, `/volumeUSB1`).
/// Empty on a non-Synology host, which flips the browse into its dev fallback.
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

/// Immediate sub-directories of `dir` as browse entries: directories only,
/// skipping hidden/system names (`.`, `@`, `#` → e.g. `@eaDir`, `#recycle`).
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

/// Sort paths case-insensitively by file name and map to `{ name, path }` entries.
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

/// Clean a folder list: trim, drop empties, dedupe.
fn clean_folders(folders: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    folders
        .into_iter()
        .map(|f| f.trim().to_string())
        .filter(|f| !f.is_empty() && seen.insert(f.clone()))
        .collect()
}

/// Background rescan triggered by library edits. Routes through the job manager
/// (the same `library.scan` job as `POST /api/scan`) so it shares the single-
/// flight guard no concurrent walk + sync racing on the DB and picks up the full
/// follow-up pipeline (probe + search reindex + enrich), instead of spawning its
/// own partial pass. A no-op when a scan is already running (it covers the edit).
fn spawn_rescan(state: SharedState) {
    let _ = state.jobs.trigger(state.clone(), crate::services::jobs::JobKey("library.scan"), "library-edit");
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::model::User;

    /// A scratch tree, removed when the guard drops. The name carries a process-
    /// unique counter as well as the pid: `cargo test` runs these in threads of
    /// one process, so a pid alone collides between two tests in this module.
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

    /// The names offered by a browse result, in the order the picker renders them.
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

    /// A real app harness, from the crate's own API support. The CRUD handlers
    /// read and write the persisted `libraries` setting, so nothing short of one
    /// exercises them.
    ///
    /// Returns the WHOLE `TestApp`, not just its `state`: the harness owns a
    /// `TempDir` for the data directory, and moving one field out of a temporary
    /// drops the rest at the end of that statement - deleting the SQLite
    /// directory out from under the state the caller is about to use. It shows up
    /// as an occasional 500 from `list_libraries` under parallel test threads,
    /// never on its own.
    fn app() -> crate::api::test_support::TestApp {
        crate::api::test_support::test_app()
    }

    /// The libraries as they are actually persisted, read back the way the
    /// handlers read them.
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
        // These come from an admin typing paths into a form, so leading spaces
        // and a stray empty row are the normal case - and a duplicated folder
        // would make the scanner walk the same tree twice and import every file
        // under two logical ids.
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
        // Dedupe happens AFTER the trim, so "/a" and " /a " are the same folder.
        assert_eq!(clean_folders(vec![" /a ".into(), "/a".into(), "/b".into()]), ["/a", "/b"]);
    }

    #[test]
    fn a_list_of_nothing_stays_a_list_of_nothing() {
        // A library with no folders is allowed (it is configured later); this
        // must not become a vec containing an empty string, which the scanner
        // would treat as the filesystem root.
        assert!(clean_folders(Vec::new()).is_empty());
        assert!(clean_folders(vec!["".into(), "  ".into()]).is_empty());
    }

    // ----- the folder picker ---------------------------------------------------

    #[test]
    fn only_directories_are_offered() {
        // The picker chooses a library FOLDER. Offering a file would let an admin
        // configure a library whose "folder" the scanner can never walk.
        let t = Tree::new("dirs-only");
        t.dir("Films");
        t.dir("Series");
        t.file("readme.txt");
        t.file("poster.jpg");

        assert_eq!(names(&browse(&t.path())), ["Films", "Series"]);
    }

    #[test]
    fn synology_system_directories_are_hidden() {
        // `@eaDir` (DSM's thumbnail cache) and `#recycle` sit inside every share
        // on a NAS. They are not media, and a library pointed at one would import
        // thousands of thumbnails as if they were the library.
        let t = Tree::new("system");
        t.dir("Films");
        t.dir("@eaDir");
        t.dir("#recycle");
        t.dir(".DS_Store_dir");

        assert_eq!(names(&browse(&t.path())), ["Films"]);
    }

    #[test]
    fn entries_are_sorted_the_way_a_human_reads_them() {
        // Byte order would put every capitalised name above every lowercase one,
        // so `anime` would land after `Zik` in a list an admin has to scan.
        let t = Tree::new("sort");
        for name in ["Zik", "anime", "Films", "docs"] {
            t.dir(name);
        }

        assert_eq!(names(&browse(&t.path())), ["anime", "docs", "Films", "Zik"]);
    }

    #[test]
    fn an_entry_carries_the_full_path_the_scanner_will_use() {
        // The UI shows `name` and stores `path`; if `path` were relative the
        // library would be saved pointing at nothing.
        let t = Tree::new("entry");
        let films = t.dir("Films");

        let body = browse(&t.path());
        let entry = &body["entries"][0];
        assert_eq!(entry["name"], "Films");
        assert_eq!(entry["path"].as_str().unwrap(), films.canonicalize().unwrap().to_string_lossy());
    }

    #[test]
    fn the_path_returned_is_the_resolved_one_not_the_one_asked_for() {
        // macOS hands out `/var/...` symlinks for temp dirs and a NAS share is
        // routinely a link into `/volume1`. The picker must hand back the path
        // the scanner will actually walk, or the saved folder drifts from the
        // browsed one the moment the link moves.
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
        // The entry point of the picker. `parent: null` is what stops the UI
        // offering an "up" button that would walk off the top.
        let body = browse("");
        assert!(body["parent"].is_null(), "{body}");
        // Either the Synology volumes (path "") or the dev fallback ("/").
        let path = body["path"].as_str().unwrap();
        assert!(path.is_empty() || path == "/", "{path}");
    }

    #[test]
    fn a_directory_that_is_not_there_is_a_miss_not_an_empty_folder() {
        // An empty list would read as "this folder has no sub-folders", and an
        // admin would save a library pointing at a path that does not exist.
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
        // Distinct from the miss above: this one succeeds, with no entries.
        let t = Tree::new("empty");
        let body = browse(&t.path());
        assert_eq!(body["entries"].as_array().unwrap().len(), 0);
    }

    // ----- confinement ---------------------------------------------------------

    #[test]
    fn with_volumes_present_the_browse_cannot_leave_them() {
        // The rule that matters on the real target. `volume_roots()` reads the
        // machine's `/`, so this drives the predicate directly - on a dev box
        // there are no volumes and the branch is never taken.
        let roots = vec![PathBuf::from("/volume1"), PathBuf::from("/volumeUSB1")];
        assert!(within_roots(Path::new("/volume1/video/Films"), &roots));
        assert!(within_roots(Path::new("/volumeUSB1"), &roots));
        assert!(!within_roots(Path::new("/etc"), &roots));
        assert!(!within_roots(Path::new("/"), &roots));
        assert!(!within_roots(Path::new("/root/.ssh"), &roots));
    }

    #[test]
    fn a_path_that_merely_starts_with_a_root_name_is_not_inside_it() {
        // `starts_with` on a Path compares whole components, so `/volume10` is
        // not under `/volume1` - a string prefix check would have let it through.
        let roots = vec![PathBuf::from("/volume1")];
        assert!(!within_roots(Path::new("/volume10/video"), &roots));
        assert!(!within_roots(Path::new("/volume1x"), &roots));
    }

    #[test]
    fn with_no_volumes_at_all_the_dev_box_may_browse_anywhere() {
        // Otherwise the picker would be empty on every non-Synology install.
        assert!(within_roots(Path::new("/etc"), &[]));
    }

    // ----- the handler ---------------------------------------------------------

    #[tokio::test]
    async fn browsing_needs_the_library_permission() {
        // The picker walks the host filesystem. Anyone who can reach it can
        // enumerate the NAS, so it is gated on library management, not on merely
        // being some kind of admin.
        let user = user_with(vec![Permission::Playback, Permission::UsersManage]);
        let err = browse_libraries(AuthUser(user), Query(BrowseQuery { path: None }))
            .await
            .unwrap_err();
        assert_eq!(err.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn a_traversal_segment_is_refused_before_the_filesystem_is_touched() {
        // `canonicalize` would happily resolve `..` and the confinement check
        // would then pass on a dev box with no volumes. Rejecting the segment up
        // front is what keeps that from being the only thing standing in the way.
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

    // ----- creating, editing and removing a library ----------------------------

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
        // Trimmed, and the duplicate folder is gone - the scanner would otherwise
        // walk the same tree twice.
        assert_eq!(saved[0].name, "Films");
        assert_eq!(saved[0].folders, ["/media/films"]);
        assert_eq!(saved[0].kind, "movies");
        // New libraries scan on their own; an admin should not have to remember.
        assert!(saved[0].auto_scan);
    }

    #[tokio::test]
    async fn every_library_gets_its_own_id() {
        // The id is hashed from the name plus a random token. Two libraries that
        // happen to share a name must still be two libraries, or editing one
        // would silently edit the other.
        let harness = app();
        let state = harness.state.clone();
        let a = create(&state, "Films", vec!["/a"]).await.unwrap();
        let b = create(&state, "Films", vec!["/b"]).await.unwrap();
        assert_ne!(a, b);
        assert_eq!(defs(&state).len(), 2);
    }

    #[tokio::test]
    async fn a_library_needs_a_name() {
        // A blank name renders as an unlabelled card nobody can identify.
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
        // The admin form PATCHes; an omitted field must keep its value rather
        // than reset to a default.
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
        // `Some(false)` has to survive: an `Option<bool>` that treated false as
        // "not supplied" would make the toggle impossible to turn off.
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
        // The form sends every field; a cleared name must not wipe the label.
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
        // A stale admin tab must not create a library by PATCHing a dead id.
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
        // Not a silent success: a delete that "worked" on a dead id would hide
        // that the admin's list is stale.
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

    // ----- the library list ----------------------------------------------------

    #[tokio::test]
    async fn the_list_reports_every_library_with_a_zeroed_card() {
        // A library with nothing scanned yet still has to render: the counts come
        // from a stats query that has no row for it, and `None` there must read
        // as zero rather than drop the card.
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
        // It is a read for the console shell; a requests moderator needs to see
        // the libraries page without holding library.manage.
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

    // ----- library cards -------------------------------------------------------

    #[test]
    fn a_library_kind_becomes_the_icon_the_card_renders() {
        // The web + TV cards switch on this string, so an unknown kind must map
        // to something that draws rather than to a blank tile.
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
