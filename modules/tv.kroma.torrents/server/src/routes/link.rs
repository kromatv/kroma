//! `/downloads/{id}/candidates` and `/downloads/{id}/link` correcting which
//! title a download is for.

use axum::extract::{Path as AxPath, Query as AxQuery, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use kroma_module_sdk::host::{blocking, json_error, AuthUser, HostStorage};

use super::require_downloads;
use crate::db::{self, DownloadLink};
use crate::downloads::matching;
use crate::{LinkBody, MatchCandidateView, MatchSource};

pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        // Ordered before the `{id}` route: `candidates` would otherwise be read
        // as a download id.
        .route("/downloads/candidates", get(search_titles::<S>))
        .route("/downloads/{id}/candidates", get(candidates::<S>))
        .route("/downloads/{id}/link", put(link::<S>).post(link::<S>))
}

#[derive(Debug, Deserialize)]
pub struct TitleSearchParams {
    q: String,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    year: Option<u32>,
}

/// `GET /downloads/candidates?q=` ranked titles for words an operator typed,
/// with no download row yet. This is what the manual-add flow pins a title with
/// before anything has been queued.
pub async fn search_titles<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    AxQuery(params): AxQuery<TitleSearchParams>,
) -> Result<Response, Response> {
    require_downloads(&state, &user)?;
    let kind = params.kind.unwrap_or_else(|| "movie".to_string());
    let results = ranked_view(&state, &params.q, &kind, params.year);
    Ok(Json(json!({
        "query": params.q,
        "kind": kind,
        "year": params.year,
        "currentTmdbId": Option::<u64>::None,
        "pinned": false,
        "results": results,
    }))
    .into_response())
}

fn ranked_view<S: HostStorage>(
    state: &S,
    query: &str,
    kind: &str,
    year: Option<u32>,
) -> Vec<MatchCandidateView> {
    state
        .metadata_candidates(query, kind, year)
        .into_iter()
        .map(|c| MatchCandidateView {
            tmdb_id: c.tmdb_id,
            kind: if kind == "movie" { "movie" } else { "show" }.to_string(),
            title: c.title,
            year: c.year,
            overview: c.overview,
            poster_url: c.poster_url,
            score: f64::from(c.score),
        })
        .collect()
}

#[derive(Debug, Deserialize)]
pub struct CandidateParams {
    #[serde(default)]
    q: Option<String>,
    /// `movie` | `show`. Falls back to what the release name looks like.
    #[serde(default)]
    kind: Option<String>,
}

/// `GET /downloads/{id}/candidates` ranked titles this download could be for.
pub async fn candidates<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
    AxQuery(params): AxQuery<CandidateParams>,
) -> Result<Response, Response> {
    require_downloads(&state, &user)?;
    let ledger = state.db().clone();
    let row = blocking(move || {
        let conn = ledger.get()?;
        Ok(db::get_download(&conn, &id)?)
    })
    .await?
    .ok_or_else(|| state.lerr(&user, StatusCode::NOT_FOUND, "error.downloadNotFound"))?;

    let shape = matching::shape_of(&row.release_title);
    let query = params
        .q
        .as_deref()
        .map(str::trim)
        .filter(|q| !q.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| shape.title.clone());
    let kind = params.kind.unwrap_or_else(|| shape.kind.clone());
    let current = row.tmdb_id;
    let results = ranked_view(&state, &query, &kind, shape.year);
    Ok(Json(json!({
        "query": query,
        "kind": kind,
        "year": shape.year,
        "currentTmdbId": current,
        "pinned": row.match_source == Some(MatchSource::Pinned),
        "results": results,
    }))
    .into_response())
}

fn valid_kind(kind: &str) -> bool {
    matches!(kind, "movie" | "season" | "episode")
}

/// `PUT /downloads/{id}/link` pin the title, at any stage of the download.
pub async fn link<S: HostStorage + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    AxPath(id): AxPath<String>,
    Json(body): Json<LinkBody>,
) -> Result<Response, Response> {
    require_downloads(&state, &user)?;
    if !valid_kind(&body.kind) {
        return Err(json_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "kind must be movie, season or episode",
        ));
    }
    if body.kind != "movie" && body.season.is_none() {
        return Err(json_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "a season or episode download needs a season number",
        ));
    }
    let ledger = state.db().clone();
    let link = DownloadLink {
        kind: body.kind,
        tmdb_id: body.tmdb_id,
        title: body.title,
        year: body.year,
        season: body.season,
        episodes: body.episodes,
        source: MatchSource::Pinned,
    };
    let found = blocking(move || db::link_download(&ledger, &id, &link)).await?;
    if !found {
        return Err(state.lerr(&user, StatusCode::NOT_FOUND, "error.downloadNotFound"));
    }
    Ok(Json(json!({ "ok": true })).into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_three_row_shapes_are_accepted() {
        assert!(valid_kind("movie"));
        assert!(valid_kind("season"));
        assert!(valid_kind("episode"));
        assert!(!valid_kind("show"));
        assert!(!valid_kind(""));
    }
}
