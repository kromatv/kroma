//! `/api/discover/*` TMDB discovery: search titles the library may not have,
//! trending for the empty state, a title detail (with the season list for the
//! picker) and one season's episodes. Every result is flagged against the local catalog so cards
//! render Play directly, and, for a viewer holding `requests.create`, against
//! open requests for the chip and Demander. Reading needs only a session.

mod flags;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use crate::api::error::{json_error, lerr};
use crate::api::extract::AuthUser;
use crate::api::util::blocking;
use crate::i18n;
use crate::i18n::AskedLocale;
use crate::infra::metadata::{discover, season_episodes};
use crate::model::{DiscoverEpisode, DiscoverResponse, RequestKind, User};
use crate::services::settings;
use crate::state::SharedState;

use flags::{flag_detail, flag_hits};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/discover/search", get(search))
        .route("/discover/trending", get(trending))
        .route("/discover/{kind}/{tmdb_id}", get(detail))
        .route("/discover/tv/{tmdb_id}/season/{season}", get(season))
}

// TMDB works zero-config via the built-in key, so absence means the operator
// explicitly blanked it: surface that rather than a silent empty page.
fn require_tmdb(state: &SharedState, user: &User) -> Result<String, Response> {
    state.config.tmdb_api_key.clone().ok_or_else(|| {
        lerr(
            i18n::user_locale(user),
            StatusCode::SERVICE_UNAVAILABLE,
            "error.tmdbUnavailable",
        )
    })
}

fn scope_from_type(kind: Option<&str>) -> discover::DiscoverScope {
    match kind {
        Some("movie") => discover::DiscoverScope::Movies,
        Some("tv") | Some("show") => discover::DiscoverScope::Shows,
        _ => discover::DiscoverScope::All,
    }
}

#[derive(Debug, Deserialize)]
pub struct SearchParams {
    #[serde(default)]
    q: String,
    #[serde(rename = "type", default)]
    kind: Option<String>,
    #[serde(default)]
    page: Option<u32>,
}

pub async fn search(
    State(state): State<SharedState>,
    AskedLocale(reader): AskedLocale,
    AuthUser(user): AuthUser,
    Query(params): Query<SearchParams>,
) -> Result<Response, Response> {
    let key = require_tmdb(&state, &user)?;
    let lang = settings::metadata_language_for(&state.settings, &state.config, reader);
    let query = params.q.trim().to_string();
    if query.is_empty() {
        return Ok(Json(DiscoverResponse {
            results: Vec::new(),
            page: 1,
            total_pages: 1,
        })
        .into_response());
    }
    let scope = scope_from_type(params.kind.as_deref());
    let page = params.page.unwrap_or(1);
    let out = blocking(move || {
        let found = discover::search(&key, &lang, scope, &query, page)
            .map_err(|()| anyhow::anyhow!("TMDB search failed"))?;
        let conn = state.db.get()?;
        Ok(DiscoverResponse {
            results: flag_hits(&conn, found.hits, &user)?,
            page: found.page,
            total_pages: found.total_pages,
        })
    })
    .await?;
    Ok(Json(out).into_response())
}

#[derive(Debug, Deserialize)]
pub struct TrendingParams {
    #[serde(rename = "type", default)]
    kind: Option<String>,
    #[serde(default)]
    page: Option<u32>,
}

/// `GET /api/discover/trending?type=&page=` this week's trending titles. No
/// `type` = merged movies + shows (page 1) for the discover empty-state rails;
/// `type=movie|tv` = a paginated single-kind list backing the full page.
pub async fn trending(
    State(state): State<SharedState>,
    AskedLocale(reader): AskedLocale,
    AuthUser(user): AuthUser,
    Query(params): Query<TrendingParams>,
) -> Result<Response, Response> {
    let key = require_tmdb(&state, &user)?;
    let lang = settings::metadata_language_for(&state.settings, &state.config, reader);
    let scope = scope_from_type(params.kind.as_deref());
    let page = params.page.unwrap_or(1);
    let out = blocking(move || {
        let found = discover::trending(&key, &lang, scope, page)
            .map_err(|()| anyhow::anyhow!("TMDB trending failed"))?;
        let conn = state.db.get()?;
        Ok(DiscoverResponse {
            results: flag_hits(&conn, found.hits, &user)?,
            page: found.page,
            total_pages: found.total_pages,
        })
    })
    .await?;
    Ok(Json(out).into_response())
}

/// `GET /api/discover/{movie|tv}/:tmdbId` detail + seasons + availability.
pub async fn detail(
    State(state): State<SharedState>,
    AskedLocale(reader): AskedLocale,
    AuthUser(user): AuthUser,
    Path((kind, tmdb_id)): Path<(String, u64)>,
) -> Result<Response, Response> {
    let key = require_tmdb(&state, &user)?;
    let loc = i18n::user_locale(&user);
    let kind = match kind.as_str() {
        "movie" => RequestKind::Movie,
        "tv" | "show" => RequestKind::Show,
        _ => return Err(json_error(StatusCode::NOT_FOUND, "unknown media type")),
    };
    let lang = settings::metadata_language_for(&state.settings, &state.config, reader);
    let out = blocking(move || {
        let detail = discover::detail(&key, &lang, kind, tmdb_id)
            .map_err(|()| anyhow::anyhow!("TMDB detail failed"))?;
        let conn = state.db.get()?;
        detail.map(|d| flag_detail(&conn, d, &user)).transpose()
    })
    .await?;
    match out {
        Some(d) => Ok(Json(d).into_response()),
        None => Err(lerr(loc, StatusCode::NOT_FOUND, "error.itemNotFound")),
    }
}

/// `GET /api/discover/tv/:tmdbId/season/:season` the episodes of one season, in
/// the viewer's language. A season TMDB cannot answer is an empty list.
pub async fn season(
    State(state): State<SharedState>,
    AskedLocale(reader): AskedLocale,
    AuthUser(user): AuthUser,
    Path((tmdb_id, season)): Path<(u64, u32)>,
) -> Result<Response, Response> {
    let key = require_tmdb(&state, &user)?;
    let lang = settings::metadata_language_for(&state.settings, &state.config, reader);
    let found = blocking(move || Ok(season_episodes(&key, &lang, tmdb_id, season))).await?;
    let episodes: Vec<DiscoverEpisode> = found.episodes.into_iter().map(Into::into).collect();
    Ok(Json(json!({ "episodes": episodes })).into_response())
}
