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
use crate::services::jobs::TriggerError;
use crate::state::SharedState;

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

// The request-tied search + grab routes are core, but the feature they call into
// lives behind the acquisition-search contract. Resolving it IS the gate: with
// no module installed, enabled and serving it, search/grab 404 everywhere.
fn require_acquisition_port(
    state: &SharedState,
    user: &User,
) -> Result<std::sync::Arc<dyn kroma_module_sdk::ports::AcquisitionSearchPort>, Response> {
    require(user, Permission::RequestsManage)?;
    acquisition_search(state, user)
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

/// `POST /api/requests/search-missing` (requests.manage) "Search all missing":
/// kick the acquisition search pass now, which auto-grabs the best release for
/// every aired-but-open wanted row. Requires the Acquisition module (its sidecar
/// registered the `acquisition.search` job); returns the job run id, or 409 when
/// a pass is already running.
pub async fn search_all_missing(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require(&user, Permission::RequestsManage)?;
    // The job only exists while a module has registered it, so resolving it is
    // the gate: no acquisition module, no pass to trigger.
    let job = state
        .jobs
        .resolve("acquisition.search")
        .ok_or_else(|| lerr(locale(&user), StatusCode::NOT_FOUND, "error.moduleDisabled"))?;
    match state.jobs.trigger(state.clone(), job, "manual") {
        Ok(run_id) => Ok(Json(json!({ "runId": run_id })).into_response()),
        Err(TriggerError::AlreadyRunning) => {
            Err(json_error(StatusCode::CONFLICT, "a search pass is already running"))
        }
        Err(TriggerError::Unknown) => {
            Err(lerr(locale(&user), StatusCode::NOT_FOUND, "error.moduleDisabled"))
        }
    }
}

/// `POST /api/requests/:id/auto-search` (requests.manage) "search this title and
/// grab the best": run the interactive sweep for one request, pick the top
/// accepted, grabbable release, and grab it. This is the per-title "ask to watch"
/// button on the missing list. Slow (a live indexer sweep); the UI shows a
/// spinner. Returns `{ grabbed, title? }`.
pub async fn auto_search_one(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    let port = require_acquisition_port(&state, &user)?;
    let rid = id.clone();
    let grabbed = service(move || {
        let scope = json!({ "kind": "all" });
        let view = port.interactive_search(&state, &rid, &scope)?;
        let Some((guid, indexer_id, title)) = best_release(&view) else {
            return Ok(None);
        };
        port.grab(&state, &rid, &scope, &guid, &indexer_id)?;
        Ok(Some(title))
    })
    .await?;
    match grabbed {
        Some(title) => Ok(Json(json!({ "grabbed": true, "title": title })).into_response()),
        None => Ok(Json(json!({ "grabbed": false })).into_response()),
    }
}

fn best_release(view: &serde_json::Value) -> Option<(String, String, String)> {
    view.get("releases")?
        .as_array()?
        .iter()
        .filter(|r| r.get("grabbable").and_then(serde_json::Value::as_bool).unwrap_or(false))
        .filter(|r| r.get("rejected").is_none_or(serde_json::Value::is_null))
        .filter_map(|r| {
            let score = r.get("score")?.as_i64()?;
            let guid = r.get("guid")?.as_str()?.to_string();
            let indexer_id = r.get("indexerId")?.as_str()?.to_string();
            let title = r.get("title").and_then(|v| v.as_str()).unwrap_or_default().to_string();
            Some((score, guid, indexer_id, title))
        })
        .max_by_key(|(score, ..)| *score)
        .map(|(_, guid, indexer_id, title)| (guid, indexer_id, title))
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
    let view =
        service(move || crate::services::request_ledger::season_ledger(&state, &id, season)).await?;
    Ok(Json(view).into_response())
}

/// What one search covers. `all` (the default) is the whole request; the others
/// narrow it to the one thing the admin pointed at, so a ten-season show is not
/// a hundred indexer round trips when only S03E07 is wanted.
#[derive(Debug, Default, Deserialize)]
pub struct ScopeParams {
    #[serde(default)]
    scope: Option<String>,
    #[serde(default)]
    season: Option<u32>,
    #[serde(default)]
    episode: Option<u32>,
}

// Mirrors the acquisition module's `SearchScope`; the core only forwards it, so
// it travels as JSON rather than as a shared type across the sidecar boundary.
fn scope_value(params: &ScopeParams) -> Result<serde_json::Value, Response> {
    let bad = |what: &str| json_error(StatusCode::BAD_REQUEST, what);
    match params.scope.as_deref().unwrap_or("all") {
        "all" => Ok(json!({ "kind": "all" })),
        "movie" => Ok(json!({ "kind": "movie" })),
        "season" => {
            let season = params.season.ok_or_else(|| bad("a season scope needs a season"))?;
            Ok(json!({ "kind": "season", "season": season }))
        }
        "episode" => {
            let season = params.season.ok_or_else(|| bad("an episode scope needs a season"))?;
            let episode = params.episode.ok_or_else(|| bad("an episode scope needs an episode"))?;
            Ok(json!({ "kind": "episode", "season": season, "episode": episode }))
        }
        other => Err(bad(&format!("unknown search scope {other:?}"))),
    }
}

/// `GET /api/requests/:id/search` (requests.manage) live interactive search:
/// sweep every enabled indexer for this request's targets, narrowed to
/// `?scope=all|movie|season|episode` (+ `&season=`/`&episode=`), and return
/// scored releases + rejects with reasons. Network-heavy (one or more Torznab
/// round trips per indexer); the UI shows a spinner.
pub async fn interactive_search(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Query(params): Query<ScopeParams>,
) -> Result<Response, Response> {
    let port = require_acquisition_port(&state, &user)?;
    let scope = scope_value(&params)?;
    let view = service(move || port.interactive_search(&state, &id, &scope)).await?;
    Ok(Json(view).into_response())
}

/// The manual-grab body (one release from the last interactive search, under
/// the scope that search ran with).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrabBody {
    guid: String,
    indexer_id: String,
    #[serde(flatten, default)]
    scope: ScopeParams,
}

/// `POST /api/requests/:id/grab` (requests.manage) manually grab one release
/// from the last interactive search of this request.
pub async fn grab(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<GrabBody>,
) -> Result<Response, Response> {
    let port = require_acquisition_port(&state, &user)?;
    let scope = scope_value(&body.scope)?;
    // The port enqueues (fast) and backgrounds the slow torrent add on the
    // acquisition sidecar, so the request returns right away.
    let rid = id.clone();
    service(move || port.grab(&state, &rid, &scope, &body.guid, &body.indexer_id)).await?;
    Ok(Json(json!({ "ok": true, "id": id })).into_response())
}

fn acquisition_search(
    state: &SharedState,
    user: &User,
) -> Result<std::sync::Arc<dyn kroma_module_sdk::ports::AcquisitionSearchPort>, Response> {
    kroma_module_sdk::ports::acquisition_search(state.as_ref())
        .ok_or_else(|| lerr(locale(user), StatusCode::NOT_FOUND, "error.moduleDisabled"))
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
    use super::*;

    // `/requests/calendar` (static) must coexist with `/requests/{id}` (param):
    // building the router panics on a real matchit conflict, so this is enough.
    #[test]
    fn router_builds_without_conflict() {
        let _r = super::routes();
    }

    fn params(scope: Option<&str>, season: Option<u32>, episode: Option<u32>) -> ScopeParams {
        ScopeParams { scope: scope.map(str::to_string), season, episode }
    }

    fn ok(scope: Option<&str>, season: Option<u32>, episode: Option<u32>) -> serde_json::Value {
        scope_value(&params(scope, season, episode)).expect("a valid scope")
    }

    #[test]
    fn an_absent_scope_is_the_whole_request() {
        // Every caller that does not narrow (the auto-search button, an older
        // client) must keep sweeping everything rather than silently searching
        // nothing.
        assert_eq!(ok(None, None, None), json!({ "kind": "all" }));
        assert_eq!(ok(Some("all"), None, None), json!({ "kind": "all" }));
    }

    #[test]
    fn a_narrowed_scope_carries_its_numbers() {
        assert_eq!(ok(Some("movie"), None, None), json!({ "kind": "movie" }));
        assert_eq!(ok(Some("season"), Some(2), None), json!({ "kind": "season", "season": 2 }));
        assert_eq!(
            ok(Some("episode"), Some(2), Some(5)),
            json!({ "kind": "episode", "season": 2, "episode": 5 })
        );
    }

    #[test]
    fn a_stray_number_never_widens_or_narrows_the_wrong_scope() {
        // `?scope=all&season=2` is a client bug; answering with a season sweep
        // would grab a pack nobody asked for.
        assert_eq!(ok(Some("all"), Some(2), Some(5)), json!({ "kind": "all" }));
        assert_eq!(ok(Some("movie"), Some(2), Some(5)), json!({ "kind": "movie" }));
        assert_eq!(ok(Some("season"), Some(2), Some(5)), json!({ "kind": "season", "season": 2 }));
    }

    #[test]
    fn a_half_filled_narrowing_is_refused_rather_than_widened() {
        // Falling back to "everything" here would run a ten-season sweep the
        // admin did not ask for, and grab from it.
        assert!(scope_value(&params(Some("season"), None, None)).is_err());
        assert!(scope_value(&params(Some("episode"), Some(2), None)).is_err());
        assert!(scope_value(&params(Some("episode"), None, Some(5))).is_err());
    }

    #[test]
    fn an_unknown_scope_is_refused() {
        assert!(scope_value(&params(Some("sideways"), None, None)).is_err());
        assert!(scope_value(&params(Some(""), None, None)).is_err());
    }
}
