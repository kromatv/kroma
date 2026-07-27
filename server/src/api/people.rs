//! `GET /api/people?name=…` every movie + show one person is credited in
//! (cast or key crew).
//!
//! The match runs over the metadata JSON in SQLite (see [`db::titles_by_person`]),
//! exact and case-insensitive distinct from the fuzzy full-text `/search`. The
//! ranked ids are hydrated into the same DTOs `/search` returns (so clients reuse
//! their card UI), ordered best-known work first (rating, then newest).

use axum::extract::{Query, State};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::dto::{PersonDetailResponse, PersonResponse, SearchHit};
use crate::api::util::{blocking, query};
use crate::db;
use crate::i18n::ReqLocale;
use crate::infra::{image, metadata};
use crate::model::{MediaItem, Metadata, Show};
use crate::services::settings;
use crate::state::SharedState;
use axum::routing::get;
use axum::Router;

/// `GET /api/people`, `GET /api/people/details`.
pub fn routes() -> Router<SharedState> {
    Router::new().route("/people", get(person)).route("/people/details", get(details))
}

#[derive(Debug, Deserialize)]
pub struct PersonParams {
    /// The person's name (exact match, case-insensitive).
    pub name: Option<String>,
    /// Optional library scope.
    pub library: Option<String>,
}

/// `GET /api/people?name=&library=` → [`PersonResponse`].
pub async fn person(
    State(state): State<SharedState>,
    ReqLocale(locale): ReqLocale,
    Query(p): Query<PersonParams>,
) -> Result<Response, Response> {
    let name = p.name.unwrap_or_default().trim().to_string();
    let library = p.library;

    if name.is_empty() {
        return Ok(Json(PersonResponse { name, results: Vec::new() }).into_response());
    }

    let resp = query(&state.db, move |pool| {
        let (movie_ids, show_ids) = db::titles_by_person(&pool, &name)?;
        let mut movies = db::get_items_by_ids(&pool, &movie_ids)?;
        let mut shows = db::get_shows_by_ids(&pool, &show_ids)?;
        db::localize::overlay_items(&pool, &mut movies, locale)?;
        db::localize::overlay_shows(&pool, &mut shows, locale)?;
        let results = collect(movies, shows, library.as_deref());
        Ok(PersonResponse { name, results })
    })
    .await?;
    Ok(Json(resp).into_response())
}

#[derive(Debug, Deserialize)]
pub struct NameParams {
    /// The person's name, as a credit spells it.
    pub name: Option<String>,
}

/// `GET /api/people/details?name=` → [`PersonDetailResponse`]: the biography and
/// life facts behind a credit, from TMDB.
///
/// Never an error when the provider has nothing to say: `person` is simply
/// `null` (no TMDB key, an unknown name, a provider hiccup). The person page is
/// the filmography first and the biography second, and it must render either
/// way. The portrait is cached locally on the way out, so it is served from
/// `/api/images` with the same `?w=` sizing as every other artwork.
pub async fn details(
    State(state): State<SharedState>,
    Query(p): Query<NameParams>,
) -> Result<Response, Response> {
    let name = p.name.unwrap_or_default().trim().to_string();
    let Some(api_key) = state.config.tmdb_api_key.clone().filter(|_| !name.is_empty()) else {
        return Ok(Json(PersonDetailResponse { name, person: None }).into_response());
    };
    let language = settings::metadata_language(&state.settings, &state.config);
    let data_dir = state.config.data_dir.clone();
    let lookup = name.clone();
    // curl (twice, on a cache miss) plus an image download: blocking work.
    let person = blocking(move || {
        Ok(metadata::person::detail(&api_key, &language, &lookup).map(|mut p| {
            if let Some(local) = p.profile_url.as_deref().and_then(|u| image::cache_remote(&data_dir, u)) {
                p.profile_url = Some(local);
            }
            p
        }))
    })
    .await?;
    Ok(Json(PersonDetailResponse { name, person }).into_response())
}

/// Merge movies + shows into one [`SearchHit`] list, optionally scoped to a single
/// library, ordered by rating (desc) then year (desc) so a person's most notable
/// work surfaces first.
fn collect(movies: Vec<MediaItem>, shows: Vec<Show>, library: Option<&str>) -> Vec<SearchHit> {
    let in_library = |lib: &str| library.is_none_or(|want| lib == want);

    let mut rows: Vec<((f32, i32), SearchHit)> = Vec::with_capacity(movies.len() + shows.len());
    for m in movies {
        if in_library(&m.library) {
            let key = sort_key(m.metadata.as_ref(), m.year);
            rows.push((key, SearchHit::Movie { item: m }));
        }
    }
    for s in shows {
        if in_library(&s.library) {
            let key = sort_key(s.metadata.as_ref(), s.year);
            rows.push((key, SearchHit::Show { show: s }));
        }
    }
    rows.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    rows.into_iter().map(|(_, hit)| hit).collect()
}

/// `(rating, year)` sort key both default to 0 when unknown so unrated/undated
/// titles sink to the bottom.
fn sort_key(meta: Option<&Metadata>, year: Option<u32>) -> (f32, i32) {
    let rating = meta.and_then(|m| m.rating).unwrap_or(0.0);
    (rating, year.map(|y| y as i32).unwrap_or(0))
}
