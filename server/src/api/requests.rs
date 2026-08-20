//! `/api/requests` the media request queue. Users with `requests.create`
//! submit and track their own; `requests.manage` holders see everyone's and
//! approve / deny. Interactive search + manual grab join with the indexer
//! milestone.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use crate::api::error::{json_error, lerr};
use crate::api::extract::AuthUser;
use crate::api::util::{blocking, query};
use crate::db;
use crate::i18n;
use crate::model::{
    CreateRequestBody, MediaRequest, Permission, RequestCounts, RequestStatus, RequestsView, User,
};
use crate::state::SharedState;

mod acquisition;
mod ledger;

use acquisition::{auto_search_one, grab, interactive_search, search_all_missing};
use ledger::{coverage, ledger, season_ledger, wanted};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/requests", get(list).post(create))
        .route("/requests/calendar", get(calendar))
        .route("/requests/missing", get(missing))
        .route("/requests/search-missing", post(search_all_missing))
        .route("/requests/{id}", axum::routing::delete(remove))
        .route("/requests/{id}/approve", post(approve))
        .route("/requests/{id}/deny", post(deny))
        .route("/requests/{id}/coverage", axum::routing::put(coverage))
        .route("/requests/{id}/wanted", get(wanted))
        .route("/requests/{id}/ledger", get(ledger))
        .route("/requests/{id}/ledger/{season}", get(season_ledger))
        .route("/requests/{id}/search", get(interactive_search))
        .route("/requests/{id}/auto-search", post(auto_search_one))
        .route("/requests/{id}/grab", post(grab))
}

fn locale(user: &User) -> &'static str {
    user.language.as_deref().and_then(i18n::normalize).unwrap_or(i18n::DEFAULT_LOCALE)
}

fn require(user: &User, perm: Permission) -> Result<(), Response> {
    if user.can(perm) {
        Ok(())
    } else {
        Err(lerr(locale(user), StatusCode::FORBIDDEN, "error.permissionDenied"))
    }
}

fn list_scope(user: &User, params: &ListParams) -> Result<(bool, String), Response> {
    require(user, Permission::RequestsCreate)?;
    let all = user.can(Permission::RequestsManage) && !params.mine.unwrap_or(false);
    Ok((all, user.id.clone()))
}

// Failures here are usually user-relevant (bad TMDB id, unknown request...), so
// surface the message as a 400 instead of a mute 500.
async fn service<T, F>(f: F) -> Result<T, Response>
where
    F: FnOnce() -> anyhow::Result<T> + Send + 'static,
    T: Send + 'static,
{
    match tokio::task::spawn_blocking(f).await {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(e)) => Err(json_error(StatusCode::BAD_REQUEST, &format!("{e:#}"))),
        Err(_) => Err(json_error(StatusCode::INTERNAL_SERVER_ERROR, "internal error")),
    }
}

fn counts_of(list: &[MediaRequest]) -> RequestCounts {
    let mut c = RequestCounts::default();
    for r in list {
        c.total += 1;
        match r.status {
            RequestStatus::Pending => c.pending += 1,
            RequestStatus::Denied => c.denied += 1,
            RequestStatus::Failed => c.failed += 1,
            RequestStatus::Available => c.available += 1,
            _ => c.active += 1,
        }
    }
    c
}

#[derive(Debug, Deserialize)]
pub struct ListParams {
    #[serde(default)]
    mine: Option<bool>,
}

/// `GET /api/requests` own requests, or everyone's for `requests.manage`.
pub async fn list(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Query(params): Query<ListParams>,
) -> Result<Response, Response> {
    let (all, uid) = list_scope(&user, &params)?;
    let view = query(&state.db, move |pool| {
        let conn = pool.get()?;
        let scope = if all { None } else { Some(uid.as_str()) };
        let mut requests = db::list_requests(&conn, scope)?;
        overlay_active_downloads(&conn, &mut requests)?;
        let counts = counts_of(&requests);
        Ok(RequestsView { requests, counts })
    })
    .await?;
    Ok(Json(view).into_response())
}

// A request with a live grab shows `downloading` (or `importing` once the grab
// completes) instead of its stored `approved`. Deriving this here rather than
// persisting a status means it self-heals the moment the torrent fails or is
// deleted. `available` is overlaid too: an upgrade grab is a live download on a
// request that is already satisfied, and it would otherwise show no progress.
fn overlay_active_downloads(
    conn: &rusqlite::Connection,
    requests: &mut [MediaRequest],
) -> rusqlite::Result<()> {
    let active = super::downloads_overlay::active_downloads(conn);
    for r in requests.iter_mut() {
        if !matches!(
            r.status,
            RequestStatus::Approved | RequestStatus::PartiallyAvailable | RequestStatus::Available
        ) {
            continue;
        }
        if let Some(a) = active.get(&r.id) {
            r.status = if a.importing { RequestStatus::Importing } else { RequestStatus::Downloading };
            r.progress = Some(a.progress);
        }
    }
    Ok(())
}

/// `GET /api/requests/calendar` the "coming soon" feed: future-dated wanted rows
/// (a movie's availability date + a show episode's air date) not yet on disk,
/// ascending by date. Own requests, or everyone's for a `requests.manage` holder
/// (unless `?mine=true` forces own-only, like `GET /requests`).
pub async fn calendar(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Query(params): Query<ListParams>,
) -> Result<Response, Response> {
    let (all, uid) = list_scope(&user, &params)?;
    let today = crate::services::requests::today_ymd();
    let entries = query(&state.db, move |pool| {
        let conn = pool.get()?;
        let scope = if all { None } else { Some(uid.as_str()) };
        Ok(db::upcoming_calendar(&conn, &today, scope, 300)?)
    })
    .await?;
    Ok(Json(entries).into_response())
}

/// `GET /api/requests/missing` the "missing / wanted" list: aired/released wanted
/// rows still not on disk (the inverse of the calendar), grouped client-side by
/// title. Own requests, or everyone's for a `requests.manage` holder.
pub async fn missing(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Query(params): Query<ListParams>,
) -> Result<Response, Response> {
    let (all, uid) = list_scope(&user, &params)?;
    let today = crate::services::requests::today_ymd();
    let entries = query(&state.db, move |pool| {
        let conn = pool.get()?;
        let scope = if all { None } else { Some(uid.as_str()) };
        let mut entries = db::missing_items(&conn, &today, scope, 500)?;
        // Library-scan gaps: shows with aired episodes not on disk that were never
        // requested (the `library.missing` job fills these). Library-wide, not
        // request-scoped; the query already excludes shows with a live request.
        entries.extend(db::library_gaps_list(&conn, 500)?);
        Ok(entries)
    })
    .await?;
    Ok(Json(entries).into_response())
}

/// `POST /api/requests` submit (duplicate-merging; auto-approve capability
/// honored inside the service).
pub async fn create(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateRequestBody>,
) -> Result<Response, Response> {
    require(&user, Permission::RequestsCreate)?;
    let req =
        service(move || crate::services::requests::create_request(&state, &user, &body)).await?;
    Ok(Json(req).into_response())
}

/// `DELETE /api/requests/:id` a manager deletes anything; a requester may
/// withdraw their own request while it is still pending.
pub async fn remove(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    require(&user, Permission::RequestsCreate)?;
    let loc = locale(&user);
    let manager = user.can(Permission::RequestsManage);
    let uid = user.id.clone();
    let id_for_event = id.clone();

    enum Outcome {
        Deleted,
        NotFound,
        Forbidden,
    }
    let pool = state.db.clone();
    let outcome = blocking(move || {
        let conn = pool.get()?;
        let Some(req) = db::get_request(&conn, &id)? else {
            return Ok(Outcome::NotFound);
        };
        let own_pending =
            req.requested_by.as_deref() == Some(uid.as_str()) && req.status == RequestStatus::Pending;
        if !(manager || own_pending) {
            return Ok(Outcome::Forbidden);
        }
        drop(conn);
        db::delete_request(&pool, &id)?;
        Ok(Outcome::Deleted)
    })
    .await?;
    match outcome {
        Outcome::NotFound => Err(lerr(loc, StatusCode::NOT_FOUND, "error.requestNotFound")),
        Outcome::Forbidden => Err(lerr(loc, StatusCode::FORBIDDEN, "error.permissionDenied")),
        Outcome::Deleted => {
            state.events.publish(crate::infra::events::ServerEvent::RequestUpdated {
                id: id_for_event,
                status: "deleted".into(),
            });
            Ok(Json(json!({ "ok": true })).into_response())
        }
    }
}

pub async fn approve(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    require(&user, Permission::RequestsManage)?;
    let reviewer = user.id.clone();
    let req =
        service(move || crate::services::requests::approve_request(&state, &id, Some(&reviewer)))
            .await?;
    Ok(Json(req).into_response())
}

#[derive(Debug, Deserialize)]
pub struct DenyBody {
    #[serde(default)]
    note: Option<String>,
}

pub async fn deny(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    body: Option<Json<DenyBody>>,
) -> Result<Response, Response> {
    require(&user, Permission::RequestsManage)?;
    let note = body.and_then(|Json(b)| b.note).filter(|n| !n.trim().is_empty());
    let reviewer = user.id.clone();
    let req = service(move || {
        crate::services::requests::deny_request(&state, &id, &reviewer, note.as_deref())
    })
    .await?;
    Ok(Json(req).into_response())
}

#[cfg(test)]
mod route_tests {
    

    // `/requests/calendar` (static) must coexist with `/requests/{id}` (param):
    // building the router panics on a real matchit conflict, so this is enough.
    #[test]
    fn router_builds_without_conflict() {
        let _r = super::routes();
    }
}
