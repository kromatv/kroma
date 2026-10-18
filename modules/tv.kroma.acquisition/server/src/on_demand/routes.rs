//! The two buttons behind an on-demand search, and the one-at-a-time latch
//! that keeps a second press from running a second pass over the indexers.

use std::sync::atomic::{AtomicBool, Ordering};

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use kroma_module_sdk::domain::{Permission, User};
use kroma_module_sdk::engine::model::RequestKind;
use kroma_module_sdk::host::{AuthUser, HostStorage, json_error};

use super::{Unit, missing_units, search_cutoff_now, search_title_now};

static RUNNING: AtomicBool = AtomicBool::new(false);

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route(
            "/acquisition/titles/{kind}/{tmdb_id}/search-now",
            post(title_now::<S>),
        )
        .route("/acquisition/cutoff/search-now", post(cutoff_now::<S>))
}

fn require<S: HostStorage>(state: &S, user: &User) -> Result<(), Response> {
    if user.can(Permission::LibraryManage) || user.can(Permission::RequestsManage) {
        return Ok(());
    }
    state.require(user, Permission::SettingsManage)
}

fn kind_of(raw: &str) -> Result<RequestKind, Response> {
    RequestKind::parse(raw).ok_or_else(|| json_error(StatusCode::BAD_REQUEST, "unknown kind"))
}

const MAX_UNITS: usize = 500;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UnitsBody {
    #[serde(default)]
    units: Vec<Unit>,
}

/// `POST /acquisition/titles/:kind/:tmdbId/search-now`: search every missing
/// unit of the title, or the ones `units` names, without reading the backoff.
async fn title_now<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Path((kind, tmdb_id)): Path<(String, u64)>,
    Json(body): Json<UnitsBody>,
) -> Result<Response, Response> {
    require(&state, &user)?;
    let kind = kind_of(&kind)?;
    if body.units.len() > MAX_UNITS {
        return Err(json_error(
            StatusCode::BAD_REQUEST,
            "too many units in one search",
        ));
    }
    let counting = state.clone();
    let units = body.units.clone();
    let open = run(move || missing_units(&counting, kind, tmdb_id, &units)).await?;
    let started = spawn(move |log| search_title_now(&state, kind, tmdb_id, &body.units, log));
    Ok(Json(json!({ "started": started, "units": open })).into_response())
}

/// `POST /acquisition/cutoff/search-now`: search every monitored title a
/// better copy could still improve, without reading their upgrade waits.
async fn cutoff_now<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require(&state, &user)?;
    let started = spawn(move |log| search_cutoff_now(&state, log));
    Ok(Json(json!({ "started": started })).into_response())
}

async fn run<T, F>(f: F) -> Result<T, Response>
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

// Sweeping every indexer takes minutes, so the pass runs off the request and
// the answer says only whether it took the latch.
fn spawn<F>(pass: F) -> bool
where
    F: FnOnce(&dyn Fn(String)) -> anyhow::Result<crate::auto::AutoSummary> + Send + 'static,
{
    if RUNNING.swap(true, Ordering::SeqCst) {
        return false;
    }
    tokio::task::spawn_blocking(move || {
        let _held = Latch;
        if let Err(e) = pass(&|line| tracing::info!(target: "acquisition", "{line}")) {
            tracing::warn!(target: "acquisition", "search now failed: {e:#}");
        }
    });
    true
}

// A pass that panics must still free the latch, or every later press answers
// "already running" until the server restarts.
struct Latch;

impl Drop for Latch {
    fn drop(&mut self) {
        RUNNING.store(false, Ordering::SeqCst);
    }
}
