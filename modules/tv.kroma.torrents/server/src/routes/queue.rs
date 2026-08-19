//! `/downloads` the download queue + history, with pause / resume
//! / remove (optionally deleting data). Readable and drivable by either
//! `requests.manage` (the moderator who grabbed) or `settings.manage`.

use std::sync::Arc;

use axum::extract::{Path as AxPath, Query as AxQuery, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use crate::db;
use kroma_module_sdk::domain::{Permission, User};

use crate::{DownloadView, DownloadsView};
use kroma_module_sdk::host::{blocking, json_error, query, service, AuthUser, HostStorage};

use crate::DownloadManager;

fn dm<S: HostStorage>(state: &S) -> Arc<DownloadManager> {
    service::<DownloadManager>(state).expect("download manager registered")
}

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/downloads", get(list::<S>))
        .route("/downloads/pause-all", post(pause_all::<S>))
        .route("/downloads/resume-all", post(resume_all::<S>))
        .route("/downloads/reannounce", post(reannounce_all::<S>))
        .route("/downloads/{id}/pause", post(pause::<S>))
        .route("/downloads/{id}/resume", post(resume::<S>))
        .route("/downloads/{id}/retry", post(retry::<S>))
        .route("/downloads/{id}/reannounce", post(reannounce::<S>))
        .route("/downloads/{id}", axum::routing::delete(remove::<S>))
}

fn require_downloads<S: HostStorage>(state: &S, user: &User) -> Result<(), Response> {
    if user.can(Permission::RequestsManage) || user.can(Permission::SettingsManage) {
        Ok(())
    } else {
        state.require(user, Permission::SettingsManage)
    }
}

const HISTORY_LIMIT: usize = 200;

pub async fn list<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require_downloads(&state, &user)?;
    let vpn = dm(&state).vpn_status();
    // Polled from the engine so the panel still has stats when the live WebSocket
    // can't reach the client. Blocking: engine stats run off the runtime.
    let live = {
        let mgr = dm(&state);
        tokio::task::spawn_blocking(move || mgr.live_stats()).await.unwrap_or_default()
    };
    // Resolved before the blocking closure, which cannot borrow the host.
    let indexers: std::collections::HashMap<String, String> =
        kroma_module_sdk::ports::indexer_db(&state)
            .and_then(|p| p.list_indexers(&state).ok())
            .unwrap_or_default()
            .into_iter()
            .map(|i| (i.id, i.name))
            .collect();
    // The client names come from this module's OWN database; the ledger below
    // from the shared one. Two files, so two lookups: resolved here because the
    // blocking closure gets only the one pool.
    let clients: std::collections::HashMap<String, String> = query(state.store(), |pool| {
        let conn = pool.get()?;
        Ok(db::list_download_clients(&conn)?.into_iter().map(|c| (c.id, c.name)).collect())
    })
    .await
    .unwrap_or_default();
    let view = query(state.db(), move |pool| {
        let conn = pool.get()?;
        let rows = db::list_downloads(&conn, HISTORY_LIMIT)?;
        let downloads = rows
            .into_iter()
            .map(|d| {
                let req = d.request_id.as_deref().and_then(|rid| db::get_request(&conn, rid).ok().flatten());
                let title = req.as_ref().map(|r| r.title.clone()).unwrap_or_else(|| d.release_title.clone());
                let poster_url = req.as_ref().and_then(|r| r.poster_url.clone());
                let indexer_name = d.indexer_id.as_deref().and_then(|id| indexers.get(id).cloned());
                let stats = live.get(&d.id).copied().unwrap_or((0, 0, 0, 0));
                let local_id = req.as_ref().and_then(|r| {
                    if d.kind == "movie" {
                        db::movie_item_by_tmdb(&conn, r.tmdb_id).ok().flatten()
                    } else {
                        db::show_by_tmdb(&conn, r.tmdb_id).ok().flatten()
                    }
                });
                DownloadView {
                    id: d.id,
                    client_name: clients.get(&d.client_id).cloned().unwrap_or_else(|| d.client_id.clone()),
                    client_id: d.client_id,
                    request_id: d.request_id,
                    kind: d.kind,
                    title,
                    release_title: d.release_title,
                    season: d.season,
                    episodes: d.episodes,
                    status: d.status,
                    progress: d.progress,
                    down_bps: stats.0,
                    up_bps: stats.1,
                    peers: stats.2,
                    peers_seen: stats.3,
                    size_bytes: d.size_bytes,
                    score: d.score,
                    error: d.error,
                    grabbed_at: d.grabbed_at,
                    completed_at: d.completed_at,
                    imported_at: d.imported_at,
                    indexer_name,
                    details_url: d.details_url,
                    info_hash: d.info_hash,
                    poster_url,
                    local_id,
                }
            })
            .collect();
        Ok(DownloadsView { downloads, vpn })
    })
    .await?;
    Ok(Json(view).into_response())
}

async fn act<S: HostStorage + Clone + Send + Sync + 'static>(
    state: S,
    user: User,
    id: String,
    f: impl FnOnce(&S, &str) -> anyhow::Result<()> + Send + 'static,
) -> Result<Response, Response> {
    require_downloads(&state, &user)?;
    let st = state.clone();
    let outcome = blocking(move || Ok(f(&st, &id))).await?;
    match outcome {
        Ok(()) => Ok(Json(json!({ "ok": true })).into_response()),
        Err(e) if format!("{e:#}").contains("not found") => {
            Err(state.lerr(&user, StatusCode::NOT_FOUND, "error.downloadNotFound"))
        }
        Err(e) => Err(json_error(StatusCode::BAD_REQUEST, &format!("{e:#}"))),
    }
}

pub async fn pause<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
) -> Result<Response, Response> {
    let downloads = dm(&state);
    act(state.clone(), user, id, move |_st, id| downloads.pause(id)).await
}

pub async fn resume<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
) -> Result<Response, Response> {
    let downloads = dm(&state);
    act(state.clone(), user, id, move |_st, id| downloads.resume(id)).await
}

/// Asks the tracker for more peers on one download.
pub async fn reannounce<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
) -> Result<Response, Response> {
    let downloads = dm(&state);
    act(state.clone(), user, id, move |_st, id| downloads.reannounce(id)).await
}

fn bulk_response(out: anyhow::Result<usize>) -> Result<Response, Response> {
    match out {
        Ok(count) => Ok(Json(json!({ "count": count })).into_response()),
        Err(e) => Err(json_error(StatusCode::BAD_REQUEST, &format!("{e:#}"))),
    }
}

pub async fn pause_all<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require_downloads(&state, &user)?;
    bulk_response(blocking(move || Ok(dm(&state).pause_all())).await?)
}

pub async fn resume_all<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require_downloads(&state, &user)?;
    bulk_response(blocking(move || Ok(dm(&state).resume_all())).await?)
}

/// Forces a tracker re-announce on every active download.
pub async fn reannounce_all<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require_downloads(&state, &user)?;
    bulk_response(blocking(move || Ok(dm(&state).reannounce_all())).await?)
}

/// Re-attempts a failed step in the background: a `completed` download whose
/// import failed is re-imported without re-downloading, a `failed` grab is reset
/// and re-added.
pub async fn retry<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
) -> Result<Response, Response> {
    require_downloads(&state, &user)?;
    let status = {
        let conn = state.db().get().map_err(|_| json_error(StatusCode::INTERNAL_SERVER_ERROR, "db"))?;
        match db::get_download(&conn, &id).ok().flatten() {
            Some(row) => row.status,
            None => return Err(json_error(StatusCode::NOT_FOUND, "download not found")),
        }
    };
    if status == "completed" || status == "imported" {
        // The import pass only considers `completed` rows, so an already-imported
        // row is flipped back first; the import itself is idempotent.
        if status == "imported" {
            let _ = db::set_download_status(state.db(), &id, "completed", None);
        }
        state.trigger_job("acquisition.import", "retry-import");
        return Ok(Json(json!({ "ok": true })).into_response());
    }
    let reset_state = state.clone();
    let row = match blocking(move || Ok(dm(&reset_state).retry(&id))).await? {
        Ok(row) => row,
        Err(e) if format!("{e:#}").contains("not found") => {
            return Err(json_error(StatusCode::NOT_FOUND, "download not found"))
        }
        Err(e) => return Err(json_error(StatusCode::BAD_REQUEST, &format!("{e:#}"))),
    };
    tokio::task::spawn_blocking(move || dm(&state).activate(&state, &row));
    Ok(Json(json!({ "ok": true })).into_response())
}

#[derive(Debug, Deserialize)]
pub struct RemoveParams {
    #[serde(rename = "deleteData", default)]
    delete_data: bool,
}

pub async fn remove<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
    AxQuery(params): AxQuery<RemoveParams>,
) -> Result<Response, Response> {
    let downloads = dm(&state);
    act(state.clone(), user, id, move |_st, id| downloads.remove(id, params.delete_data)).await
}
