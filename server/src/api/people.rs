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

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/people", get(person))
        .route("/people/details", get(details))
}

#[derive(Debug, Deserialize)]
pub struct PersonParams {
    pub name: Option<String>,
    pub library: Option<String>,
}

/// `GET /api/people?name=&library=` → [`PersonResponse`]. `name` is a person
/// id, a slug or a display name.
pub async fn person(
    State(state): State<SharedState>,
    ReqLocale(locale): ReqLocale,
    Query(p): Query<PersonParams>,
) -> Result<Response, Response> {
    let lookup = p.name.unwrap_or_default().trim().to_string();
    let library = p.library;

    let resp = query(&state.db, move |pool| {
        let Some(found) = db::resolve_person(&pool, &lookup)? else {
            return Ok(PersonResponse {
                name: lookup,
                results: Vec::new(),
            });
        };
        if !found.namesakes.is_empty() {
            tracing::warn!(
                answered_with = %found.name,
                namesakes = ?found.namesakes,
                "several credited names fold to one person slug"
            );
        }
        let mut movies = db::get_items_by_ids(&pool, &found.movie_ids)?;
        let mut shows = db::get_shows_by_ids(&pool, &found.show_ids)?;
        db::localize::overlay_items(&pool, &mut movies, locale)?;
        db::localize::overlay_shows(&pool, &mut shows, locale)?;
        Ok(PersonResponse {
            name: found.name,
            results: hits_best_known_first(movies, shows, library.as_deref()),
        })
    })
    .await?;
    Ok(Json(resp).into_response())
}

#[derive(Debug, Deserialize)]
pub struct NameParams {
    pub name: Option<String>,
}

/// `GET /api/people/details?name=` → [`PersonDetailResponse`]. Never an error:
/// `person` is `null` for no TMDB key, an unknown name, or a provider hiccup.
/// The portrait is cached locally and served from `/api/images` like other art.
pub async fn details(
    State(state): State<SharedState>,
    Query(p): Query<NameParams>,
) -> Result<Response, Response> {
    let lookup = p.name.unwrap_or_default().trim().to_string();
    let Some(api_key) = state
        .config
        .tmdb_api_key
        .clone()
        .filter(|_| !lookup.is_empty())
    else {
        return Ok(Json(PersonDetailResponse {
            name: lookup,
            person: None,
            credits: Vec::new(),
        })
        .into_response());
    };
    let (name, tmdb_id) = credited_person(&state, lookup).await?;
    let language = settings::metadata_language(&state.settings, &state.config);
    let data_dir = state.config.data_dir.clone();
    let lookup = name.clone();
    let (person, credits) = blocking(move || {
        let person =
            metadata::person::detail(&api_key, &language, &lookup, tmdb_id).map(|mut p| {
                if let Some(local) = p
                    .profile_url
                    .as_deref()
                    .and_then(|u| image::cache_remote(&data_dir, u))
                {
                    p.profile_url = Some(local);
                }
                p
            });
        let credits = metadata::person::filmography(&api_key, &language, &lookup, tmdb_id);
        Ok((person, credits))
    })
    .await?;
    Ok(Json(PersonDetailResponse {
        name,
        person,
        credits,
    })
    .into_response())
}

async fn credited_person(
    state: &SharedState,
    lookup: String,
) -> Result<(String, Option<u64>), Response> {
    let wanted = lookup.clone();
    let found = query(&state.db, move |pool| db::resolve_person(&pool, &wanted)).await?;
    // A person credited in no LOCAL title still has a page, reached from a
    // discover title's cast: there is no credit to fold, so a numeric segment is
    // the provider's own id and the only thing that can answer.
    Ok(found.map_or_else(
        || (lookup.clone(), lookup.parse::<u64>().ok()),
        |person| (person.name, person.tmdb_id),
    ))
}

fn hits_best_known_first(
    movies: Vec<MediaItem>,
    shows: Vec<Show>,
    library: Option<&str>,
) -> Vec<SearchHit> {
    let in_library = |lib: &str| library.is_none_or(|want| lib == want);

    let mut rows: Vec<((f32, i32), SearchHit)> = Vec::with_capacity(movies.len() + shows.len());
    for m in movies {
        if in_library(&m.library) {
            let key = best_known_rank(m.metadata.as_ref(), m.year);
            rows.push((key, SearchHit::Movie { item: m }));
        }
    }
    for s in shows {
        if in_library(&s.library) {
            let key = best_known_rank(s.metadata.as_ref(), s.year);
            rows.push((key, SearchHit::Show { show: s }));
        }
    }
    rows.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    rows.into_iter().map(|(_, hit)| hit).collect()
}

fn best_known_rank(meta: Option<&Metadata>, year: Option<u32>) -> (f32, i32) {
    let rating = meta.and_then(|m| m.rating).unwrap_or(0.0);
    (rating, year.map(|y| y as i32).unwrap_or(0))
}
