//! `/api/monitoring`: the titles the server wants to hold, and how a show's
//! episodes join that want. `library.manage` only.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use serde_json::json;

use crate::api::error::{json_error, lerr};
use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::i18n;
use crate::model::{
    BulkMonitorBody, EpisodeMonitoringBody, MonitorBody, Permission, RequestKind, User,
};
use crate::services::monitoring;
use crate::state::SharedState;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/monitoring", get(list))
        .route("/monitoring/bulk", post(bulk))
        .route(
            "/monitoring/{kind}/{tmdb_id}",
            get(one).put(monitor).delete(unmonitor),
        )
        .route("/monitoring/{kind}/{tmdb_id}/ledger", get(ledger))
        .route("/monitoring/{kind}/{tmdb_id}/ledger/{season}", get(season_ledger))
        .route("/monitoring/{kind}/{tmdb_id}/episodes", put(episodes))
}

fn require(user: &User) -> Result<(), Response> {
    if user.can(Permission::LibraryManage) {
        return Ok(());
    }
    Err(lerr(
        i18n::user_locale(user),
        StatusCode::FORBIDDEN,
        "error.permissionDenied",
    ))
}

fn kind_of(raw: &str) -> Result<RequestKind, Response> {
    RequestKind::parse(raw).ok_or_else(|| json_error(StatusCode::BAD_REQUEST, "unknown kind"))
}

async fn service<T, F>(f: F) -> Result<T, Response>
where
    F: FnOnce() -> anyhow::Result<T> + Send + 'static,
    T: Send + 'static,
{
    match tokio::task::spawn_blocking(f).await {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(e)) => Err(json_error(StatusCode::BAD_REQUEST, &format!("{e:#}"))),
        Err(_) => Err(json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal error",
        )),
    }
}

/// `GET /api/monitoring`: every monitored title, with what the library holds.
pub async fn list(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require(&user)?;
    let today = crate::services::requests::today_ymd();
    let titles = query(&state.db, move |pool| {
        let conn = pool.get()?;
        Ok(db::monitored_summaries(&conn, &today)?)
    })
    .await?;
    Ok(Json(titles).into_response())
}

/// `GET /api/monitoring/:kind/:tmdbId`: how a title is monitored, or 404.
pub async fn one(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path((kind, tmdb_id)): Path<(String, u64)>,
) -> Result<Response, Response> {
    require(&user)?;
    let kind = kind_of(&kind)?;
    let title = query(&state.db, move |pool| {
        let conn = pool.get()?;
        Ok(db::get_monitored(&conn, kind, tmdb_id)?)
    })
    .await?;
    match title {
        Some(title) => Ok(Json(title).into_response()),
        None => Err(json_error(StatusCode::NOT_FOUND, "not monitored")),
    }
}

/// `PUT /api/monitoring/:kind/:tmdbId`: monitor a title, or change how.
pub async fn monitor(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path((kind, tmdb_id)): Path<(String, u64)>,
    Json(body): Json<MonitorBody>,
) -> Result<Response, Response> {
    require(&user)?;
    let kind = kind_of(&kind)?;
    let title =
        service(move || monitoring::monitor(&state, kind, tmdb_id, &body, Some(&user.id))).await?;
    Ok(Json(title).into_response())
}

/// `DELETE /api/monitoring/:kind/:tmdbId`: stop monitoring a title.
pub async fn unmonitor(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path((kind, tmdb_id)): Path<(String, u64)>,
) -> Result<Response, Response> {
    require(&user)?;
    let kind = kind_of(&kind)?;
    let removed = service(move || monitoring::unmonitor(&state, kind, tmdb_id)).await?;
    Ok(Json(json!({ "ok": removed })).into_response())
}

/// `PUT /api/monitoring/show/:tmdbId/episodes`: switch seasons and episodes.
pub async fn episodes(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path((kind, tmdb_id)): Path<(String, u64)>,
    Json(body): Json<EpisodeMonitoringBody>,
) -> Result<Response, Response> {
    require(&user)?;
    if kind_of(&kind)? != RequestKind::Show {
        return Err(json_error(StatusCode::BAD_REQUEST, "a movie has no episodes"));
    }
    let title = service(move || monitoring::set_episodes(&state, tmdb_id, &body)).await?;
    Ok(Json(title).into_response())
}

/// `POST /api/monitoring/bulk`: the same settings for many titles.
pub async fn bulk(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<BulkMonitorBody>,
) -> Result<Response, Response> {
    require(&user)?;
    if body.titles.len() > 500 {
        return Err(json_error(StatusCode::BAD_REQUEST, "at most 500 titles at once"));
    }
    let summary = service(move || Ok(monitoring::monitor_many(&state, &body, Some(&user.id)))).await?;
    let failed: Vec<serde_json::Value> = summary
        .failed
        .iter()
        .map(|(title, error)| json!({ "kind": title.kind, "tmdbId": title.tmdb_id, "error": error }))
        .collect();
    Ok(Json(json!({ "monitored": summary.monitored, "failed": failed })).into_response())
}

/// `GET /api/monitoring/:kind/:tmdbId/ledger`: the title as TMDB knows it,
/// against its rows and the library.
pub async fn ledger(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path((kind, tmdb_id)): Path<(String, u64)>,
) -> Result<Response, Response> {
    require(&user)?;
    let kind = kind_of(&kind)?;
    let view = service(move || crate::services::request_ledger::title_ledger(&state, kind, tmdb_id))
        .await?;
    Ok(Json(view).into_response())
}

/// `GET /api/monitoring/show/:tmdbId/ledger/:season`: one season's episodes.
pub async fn season_ledger(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path((kind, tmdb_id, season)): Path<(String, u64, u32)>,
) -> Result<Response, Response> {
    require(&user)?;
    kind_of(&kind)?;
    let view = service(move || {
        crate::services::request_ledger::title_season_ledger(&state, tmdb_id, season)
    })
    .await?;
    Ok(Json(view).into_response())
}
