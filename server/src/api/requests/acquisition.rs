//! The acquisition surface of a request: the live indexer sweep, the release it
//! picks, and the manual grab. Every one of them is forwarded to whichever module
//! answers the `acquisition` point, as opaque JSON.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;

use crate::api::error::{json_error, lerr};
use crate::api::extract::AuthUser;
use crate::model::{
    Permission, User,
};
use crate::api::point;
use crate::services::jobs::TriggerError;
use crate::state::SharedState;

use super::{require, service};

// The search + grab routes are core, but the work behind them happens in
// whichever module answers this point. The core holds the name and forwards
// opaque JSON: the scored-releases view is the client's business, not the core's.
const ACQUISITION: &str = "acquisition";

// Resolving IS the gate: with no module installed, enabled and answering the
// point, search/grab 404 everywhere.
fn require_acquisition_point(
    state: &SharedState,
    user: &User,
) -> Result<kroma_module_host::Resolver, Response> {
    require(user, Permission::RequestsManage)?;
    point::require(state, user, ACQUISITION)
}

fn search_at(
    resolve: &kroma_module_host::Resolver,
    id: &str,
    scope: &serde_json::Value,
) -> anyhow::Result<serde_json::Value> {
    kroma_module_host::call_point(
        resolve,
        ACQUISITION,
        "search",
        &json!({ "request_id": id, "scope": scope }),
    )
}

fn grab_at(
    resolve: &kroma_module_host::Resolver,
    id: &str,
    scope: &serde_json::Value,
    guid: &str,
    indexer_id: &str,
) -> anyhow::Result<String> {
    kroma_module_host::call_point(
        resolve,
        ACQUISITION,
        "grab",
        &json!({
            "request_id": id,
            "scope": scope,
            "guid": guid,
            "indexer_id": indexer_id,
        }),
    )
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
        .ok_or_else(|| lerr(super::locale(&user), StatusCode::NOT_FOUND, "error.moduleDisabled"))?;
    match state.jobs.trigger(state.clone(), job, "manual") {
        Ok(run_id) => Ok(Json(json!({ "runId": run_id })).into_response()),
        Err(TriggerError::AlreadyRunning) => {
            Err(json_error(StatusCode::CONFLICT, "a search pass is already running"))
        }
        Err(TriggerError::Unknown) => {
            Err(lerr(super::locale(&user), StatusCode::NOT_FOUND, "error.moduleDisabled"))
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
    let resolve = require_acquisition_point(&state, &user)?;
    let rid = id.clone();
    let grabbed = service(move || {
        let scope = json!({ "kind": "all" });
        let view = search_at(&resolve, &rid, &scope)?;
        let Some((guid, indexer_id, title)) = best_release(&view) else {
            return Ok(None);
        };
        grab_at(&resolve, &rid, &scope, &guid, &indexer_id)?;
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

// Mirrors the acquisition module's own scope type; the core only forwards it, so
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
    let resolve = require_acquisition_point(&state, &user)?;
    let scope = scope_value(&params)?;
    let view = service(move || search_at(&resolve, &id, &scope)).await?;
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
    let resolve = require_acquisition_point(&state, &user)?;
    let scope = scope_value(&body.scope)?;
    // The module enqueues (fast) and backgrounds the slow torrent add, so the
    // request returns right away.
    let rid = id.clone();
    service(move || grab_at(&resolve, &rid, &scope, &body.guid, &body.indexer_id)).await?;
    Ok(Json(json!({ "ok": true, "id": id })).into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

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
