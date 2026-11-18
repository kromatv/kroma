//! `/api/admin/imports`: one import of another media server, started with what
//! the owner kept on the review screen.
//!
//! An import runs as the `household.import` job, so its progress, its log and
//! its cancel are the job console's, under `/api/admin/jobs/household.import`.
//! What is here starts one and reads back how it stands and what it brought.

use axum::extract::{DefaultBodyLimit, Path, Query, State};
use axum::http::StatusCode;
use axum::response::Response;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::api::error::{json_error, lerr};
use crate::api::extract::AuthUser;
use crate::api::util::blocking;
use crate::db;
use crate::db::imports::Window;
use crate::model::import::Title;
use crate::model::imports::{Import, Origin, Selection};
use crate::model::{Permission, User};
use crate::services::imports::{self, FoldersAsk, Request, StartError};
use crate::state::SharedState;

const MAX_START_BYTES: usize = 256 * 1024;
const IMPORTS_LISTED: usize = 50;
const UNMATCHED_PER_PAGE: usize = 100;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/imports", get(list).post(start))
        .route("/imports/folders", post(folders))
        .route("/imports/{id}", get(one))
        .route("/imports/{id}/unmatched", get(unmatched))
        .layer(DefaultBodyLimit::max(MAX_START_BYTES))
}

/// What starts an import: the importer and the server to read, the reference
/// `connect` gave for the sign-in, and what the owner kept. A kept library
/// names the folders the owner confirmed for it.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartBody {
    importer: String,
    sign_in: String,
    server: Origin,
    #[serde(default)]
    selection: Selection,
}

/// The import that was queued and the job run that carries it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Started {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    run_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ImportList {
    imports: Vec<Import>,
}

/// `total` counts every title the import matched to nothing, `titles` is one
/// page of them as the other server described them.
#[derive(Debug, Serialize)]
pub struct Unmatched {
    total: u64,
    titles: Vec<Title>,
}

/// The folders a review screen is about to show for one server, as the other
/// server names them.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoldersBody {
    importer: String,
    server: String,
    #[serde(default)]
    folders: Vec<String>,
}

/// One folder of the other server and where it is on this machine. No `here`
/// is a folder the review screen asks the owner for.
#[derive(Debug, Serialize)]
pub struct Folder {
    folder: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    here: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FolderList {
    folders: Vec<Folder>,
}

#[derive(Debug, Deserialize)]
pub struct UnmatchedQuery {
    #[serde(default)]
    offset: usize,
    limit: Option<usize>,
}

fn refused(user: &User, why: StartError) -> Response {
    match why {
        StartError::Invalid(what) => json_error(StatusCode::BAD_REQUEST, &what),
        StartError::Absent => lerr(
            super::user_locale(user),
            StatusCode::NOT_FOUND,
            "error.moduleDisabled",
        ),
        StartError::Busy => json_error(StatusCode::CONFLICT, "an import is already running"),
        StartError::Internal(error) => {
            tracing::warn!(error = %format!("{error:#}"), "an import could not start");
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "internal error")
        }
    }
}

fn not_found() -> Response {
    json_error(StatusCode::NOT_FOUND, "import not found")
}

/// `POST /api/admin/imports` queues an import and starts the job that runs it.
/// 409 while another import is queued or running, 404 when the importer is not
/// running.
pub async fn start(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<StartBody>,
) -> Result<Json<Started>, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let request = Request {
        importer: body.importer,
        sign_in: body.sign_in,
        server: body.server,
        selection: body.selection,
        started_by: user.id.clone(),
    };
    let started = blocking(move || Ok(imports::start(&state, request))).await?;
    let started = started.map_err(|why| refused(&user, why))?;
    Ok(Json(Started {
        id: started.id,
        run_id: started.run_id,
    }))
}

/// `POST /api/admin/imports/folders` where each folder of the other server is
/// on this machine, in the order asked: where an earlier import kept it, else
/// under the same name when this machine has that folder. The review screen
/// sends back each one the owner confirms as a `folders` entry of the library
/// it kept, and a source is made over no folder it did not send.
pub async fn folders(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<FoldersBody>,
) -> Result<Json<FolderList>, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let ask = FoldersAsk {
        importer: body.importer,
        server: body.server,
        folders: body.folders,
    };
    let folders = blocking(move || {
        let here = imports::folders_here(&state, &ask)?;
        let placed = ask.folders.into_iter().zip(here);
        Ok(placed
            .map(|(folder, here)| Folder { folder, here })
            .collect())
    })
    .await?;
    Ok(Json(FolderList { folders }))
}

/// `GET /api/admin/imports` the imports this server ran, newest first.
pub async fn list(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Json<ImportList>, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let imports = blocking(move || db::imports::list(&state.db, IMPORTS_LISTED)).await?;
    Ok(Json(ImportList { imports }))
}

/// `GET /api/admin/imports/:id` one import: how it stands and its report, which
/// a running import keeps up to date.
pub async fn one(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<Import>, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let import = blocking(move || db::imports::get(&state.db, &id)).await?;
    import.map(Json).ok_or_else(not_found)
}

/// `GET /api/admin/imports/:id/unmatched?offset=&limit=` the titles an import
/// matched to nothing, each by its name on the other server and its files.
pub async fn unmatched(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Query(query): Query<UnmatchedQuery>,
) -> Result<Json<Unmatched>, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let window = Window {
        offset: query.offset,
        limit: query
            .limit
            .unwrap_or(UNMATCHED_PER_PAGE)
            .min(UNMATCHED_PER_PAGE),
    };
    let found = blocking(move || {
        let Some(import) = db::imports::get(&state.db, &id)? else {
            return Ok(None);
        };
        let titles = db::imports::unmatched(&state.db, &id, window)?;
        Ok(Some(Unmatched {
            total: import.unmatched_titles,
            titles,
        }))
    })
    .await?;
    found.map(Json).ok_or_else(not_found)
}
