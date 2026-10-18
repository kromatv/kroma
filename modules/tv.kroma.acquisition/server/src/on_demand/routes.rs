//! The two buttons behind an on-demand search.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router};
use serde::Deserialize;

use kroma_module_sdk::domain::{Permission, User};
use kroma_module_sdk::engine::model::RequestKind;
use kroma_module_sdk::host::{AuthUser, HostStorage, json_error};

use super::{Unit, start_cutoff_search, start_title_search};
use crate::http::run;

const MAX_UNITS: usize = 500;

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
    let answer = run(move || start_title_search(&state, kind, tmdb_id, &body.units)).await?;
    Ok(Json(answer).into_response())
}

/// `POST /acquisition/cutoff/search-now`: search every monitored title a
/// better copy could still improve, without reading their upgrade waits.
async fn cutoff_now<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    require(&state, &user)?;
    let answer = run(move || start_cutoff_search(&state)).await?;
    Ok(Json(answer).into_response())
}

#[cfg(test)]
mod tests;
