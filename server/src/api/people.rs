use std::path::{Path, PathBuf};

use axum::extract::{FromRequestParts, Query, State};
use axum::http::request::Parts;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::dto::{one_per_title, PersonDetailResponse, PersonResponse, SearchHit};
use crate::api::util::{blocking, query};
use crate::api::visibility::{AuthViewer, ShowRatings, Viewer};
use crate::db;
use crate::i18n::{AskedLocale, ContentLocale};
use crate::infra::metadata::person::TmdbCredit;
use crate::infra::{image, metadata};
use crate::model::{MediaItem, Metadata, PersonDetail, Show};
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
    AuthViewer(viewer): AuthViewer,
    ContentLocale(locale): ContentLocale,
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
            results: hits_best_known_first(movies, shows, library.as_deref(), &viewer),
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
/// Under a ceiling the provider's filmography is left out: the server knows no
/// rating for a title it does not hold (BROWSE-63).
pub async fn details(
    State(state): State<SharedState>,
    reader: Reader,
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
    let asked = ProviderAsk {
        language: settings::metadata_language_for(&state.settings, &state.config, reader.language),
        data_dir: state.config.data_dir.clone(),
        held: reader.viewer.is_held(),
        api_key,
        name: name.clone(),
        tmdb_id,
    };
    let (person, credits) = blocking(move || Ok(asked.fetch())).await?;
    Ok(Json(PersonDetailResponse {
        name,
        person,
        credits,
    })
    .into_response())
}

/// Who reads a person's page: the session's viewer, and the language it asked
/// for.
pub struct Reader {
    viewer: Viewer,
    language: Option<&'static str>,
}

impl FromRequestParts<SharedState> for Reader {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let AuthViewer(viewer) = AuthViewer::from_request_parts(parts, state).await?;
        let Ok(AskedLocale(language)) = AskedLocale::from_request_parts(parts, state).await;
        Ok(Reader { viewer, language })
    }
}

struct ProviderAsk {
    api_key: String,
    language: String,
    name: String,
    tmdb_id: Option<u64>,
    data_dir: PathBuf,
    held: bool,
}

impl ProviderAsk {
    fn fetch(self) -> (Option<PersonDetail>, Vec<TmdbCredit>) {
        let found =
            metadata::person::detail(&self.api_key, &self.language, &self.name, self.tmdb_id);
        let person = found.map(|p| with_local_portrait(p, &self.data_dir));
        if self.held {
            return (person, Vec::new());
        }
        let credits =
            metadata::person::filmography(&self.api_key, &self.language, &self.name, self.tmdb_id);
        (person, credits)
    }
}

fn with_local_portrait(mut person: PersonDetail, data_dir: &Path) -> PersonDetail {
    let cached = person
        .profile_url
        .as_deref()
        .and_then(|url| image::cache_remote(data_dir, url));
    if let Some(local) = cached {
        person.profile_url = Some(local);
    }
    person
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
    viewer: &Viewer,
) -> Vec<SearchHit> {
    let in_library = |lib: &str| library.is_none_or(|want| lib == want);
    let films = ShowRatings::new();

    let mut rows: Vec<((f32, i32), SearchHit)> = Vec::with_capacity(movies.len() + shows.len());
    for mut m in movies {
        if in_library(&m.library) && viewer.sees_item(&m, &films) {
            viewer.relabel(m.metadata.as_mut());
            let key = best_known_rank(m.metadata.as_ref(), m.year);
            rows.push((key, SearchHit::Movie { item: m }));
        }
    }
    for mut s in shows {
        if in_library(&s.library) && viewer.sees_show(&s) {
            viewer.relabel(s.metadata.as_mut());
            let key = best_known_rank(s.metadata.as_ref(), s.year);
            rows.push((key, SearchHit::Show { show: s }));
        }
    }
    rows.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    one_per_title(rows.into_iter().map(|(_, hit)| hit).collect())
}

fn best_known_rank(meta: Option<&Metadata>, year: Option<u32>) -> (f32, i32) {
    let rating = meta.and_then(|m| m.rating).unwrap_or(0.0);
    (rating, year.map(|y| y as i32).unwrap_or(0))
}
