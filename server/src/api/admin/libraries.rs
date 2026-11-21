//! Library CRUD and rescans. Edits persist to the settings store and kick a
//! background rescan so the catalogue reflects the change.

use axum::extract::{Path as AxPath, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;

use crate::api::error::{lerr, lerr_with};
use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::infra::events::ServerEvent;
use crate::model::{Permission, User};
use crate::services::settings::{self, LibraryDef};
use crate::state::SharedState;
use axum::routing::{get, patch, post};
use axum::Router;

mod browse;

#[cfg(test)]
mod tests;

/// Paths are relative to the `/api/admin` nest.
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/libraries", get(list_libraries).post(create_library))
        .route("/libraries/browse", get(browse::browse_libraries))
        .route(
            "/libraries/{id}",
            patch(update_library).delete(delete_library),
        )
        .route("/libraries/{id}/scan", post(scan_library))
}

async fn configured(state: &SharedState, user: &User) -> Result<Vec<LibraryDef>, Response> {
    if let Ok(defs) = settings::library_defs(&state.settings, &state.config) {
        return Ok(defs);
    }
    let notice = query(&state.db, |pool| {
        Ok(settings::unreadable_list_notice(&pool))
    })
    .await?;
    Err(lerr_with(
        super::user_locale(user),
        StatusCode::CONFLICT,
        notice.key,
        &[("libraries", &notice.libraries)],
    ))
}

pub async fn list_libraries(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    let defs = configured(&state, &user).await?;
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
                demo: settings::is_demo_library(&d.id),
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
        return Err(lerr(
            super::user_locale(&user),
            StatusCode::BAD_REQUEST,
            "admin.nameRequired",
        ));
    }
    let mut defs = configured(&state, &user).await?;
    defs.retain(|held| !settings::is_demo_library(&held.id));
    let folders = clean_folders(body.folders);
    if let Some(sharing) = settings::library_sharing_files(&defs, &folders, None) {
        return Err(shares_files(&user, &sharing.name));
    }
    let id = crate::services::scan::short_hash(&format!(
        "lib|{name}|{}",
        crate::services::auth::random_token()
    ));
    defs.push(LibraryDef {
        id: id.clone(),
        name,
        kind: body.kind.unwrap_or_default(),
        folders,
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
    let mut defs = configured(&state, &user).await?;
    let Some(at) = defs.iter().position(|d| d.id == id) else {
        return Err(lerr(
            super::user_locale(&user),
            StatusCode::NOT_FOUND,
            "error.libraryNotFound",
        ));
    };
    let folders = body.folders.map(clean_folders);
    let added = added_folders(folders.as_deref(), &defs[at].folders);
    if let Some(sharing) = settings::library_sharing_files(&defs, &added, Some(&id)) {
        return Err(shares_files(&user, &sharing.name));
    }
    let def = &mut defs[at];
    let needs_scan = folders.is_some();
    if let Some(name) = body.name.filter(|n| !n.trim().is_empty()) {
        def.name = name.trim().to_string();
    }
    if let Some(kind) = body.kind {
        def.kind = kind;
    }
    if let Some(folders) = folders {
        def.folders = folders;
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
    let mut defs = configured(&state, &user).await?;
    let before = defs.len();
    defs.retain(|d| d.id != id);
    if defs.len() == before {
        return Err(lerr(
            super::user_locale(&user),
            StatusCode::NOT_FOUND,
            "error.libraryNotFound",
        ));
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

fn added_folders(folders: Option<&[String]>, held: &[String]) -> Vec<String> {
    folders
        .unwrap_or_default()
        .iter()
        .filter(|folder| !held.contains(folder))
        .cloned()
        .collect()
}

fn shares_files(user: &User, library: &str) -> Response {
    lerr_with(
        super::user_locale(user),
        StatusCode::CONFLICT,
        "error.libraryFoldersShared",
        &[("library", library)],
    )
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
    let _ = state.jobs.trigger_after(
        state.clone(),
        crate::services::jobs::JobKey("library.scan"),
        "library-edit",
    );
}
