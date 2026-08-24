//! What a request covers and how much of it the library already holds: the
//! wanted ledger and the TMDB view of it.

use axum::extract::{Path, State};
use axum::response::{IntoResponse, Response};
use axum::Json;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::model::Permission;
use crate::state::SharedState;

use super::{require, service};

/// `GET /api/requests/:id/wanted` (requests.manage) the request's ledger: every
/// season/episode it covers with its state. This is what the release search can
/// be aimed at, so the admin page builds its scope picker from it rather than
/// from TMDB.
pub async fn wanted(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    require(&user, Permission::RequestsManage)?;
    let entries = query(&state.db, move |pool| {
        let conn = pool.get()?;
        Ok(db::wanted_for_request(&conn, &id)?
            .into_iter()
            .map(|w| crate::model::WantedEntry {
                id: w.id,
                season: w.season,
                episode: w.episode,
                air_date: w.air_date,
                status: w.status,
            })
            .collect::<Vec<_>>())
    })
    .await?;
    Ok(Json(entries).into_response())
}

/// `PUT /api/requests/:id/coverage` (requests.manage) set exactly what a show
/// request covers. The wanted ledger is reconciled to match, keeping the state
/// of every episode that stays in scope, so this is also how an admin tells the
/// automatic search pass what to hunt for.
pub async fn coverage(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<crate::model::RequestCoverageBody>,
) -> Result<Response, Response> {
    require(&user, Permission::RequestsManage)?;
    let req = service(move || {
        crate::services::requests::set_coverage(&state, &id, body.seasons, body.episodes)
    })
    .await?;
    Ok(Json(req).into_response())
}

/// `GET /api/requests/:id/ledger` (requests.manage) the requested title as TMDB
/// describes it: every season, with how much of it the request covers and how
/// much the library already holds. Wider than `/wanted`, which only knows the
/// request's own rows.
pub async fn ledger(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    require(&user, Permission::RequestsManage)?;
    let view = service(move || crate::services::request_ledger::ledger(&state, &id)).await?;
    Ok(Json(view).into_response())
}

/// `GET /api/requests/:id/ledger/:season` (requests.manage) one season's
/// episodes from TMDB, flagged against the ledger and the library. Fetched a
/// season at a time so opening the page is one TMDB call, not twenty.
pub async fn season_ledger(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path((id, season)): Path<(String, u32)>,
) -> Result<Response, Response> {
    require(&user, Permission::RequestsManage)?;
    let view = service(move || crate::services::request_ledger::season_ledger(&state, &id, season))
        .await?;
    Ok(Json(view).into_response())
}
