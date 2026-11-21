//! Catalogue browse + detail endpoints (libraries / items / movies / shows) and
//! the sign-in screen's splash sample.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::error::json_error;
use crate::api::util::query;
use crate::api::visibility::{self, AuthViewer, Title};
use crate::api::etag;
use crate::db;
use crate::i18n::ContentLocale;
use crate::model::{show_card, MediaCard, MediaItem};
use crate::state::SharedState;
use axum::routing::get;
use axum::Router;

/// Unauthenticated: `/splash` is the deliberate exception to "no catalogue data
/// before a session": a fixed-size random sample of covers for the sign-in
/// screen, never a listing.
pub fn public_routes() -> Router<SharedState> {
    Router::new().route("/splash", get(splash))
}

/// Gated by the session middleware in [`super`] so the library isn't listable
/// anonymously.
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/libraries", get(list_libraries))
        .route("/items", get(list_items))
        .route("/movies", get(list_movies))
        .route("/shows", get(list_shows))
        .route("/shows/{id}", get(get_show))
        .route("/items/{id}", get(get_item))
        .route_layer(axum::middleware::from_fn(etag::revalidate))
}

#[derive(Debug, Deserialize)]
pub struct LibraryQuery {
    pub library: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ListView {
    Card,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub library: Option<String>,
    pub view: Option<ListView>,
}

const SPLASH_COVERS: usize = 40;

/// `GET /api/splash` → `SplashEntry[]`: a random sample of backdrop art with
/// title/year captions, for the sign-in screen's ambient slideshow. The
/// sample is small and random on every call, so the catalogue stays
/// unlistable without a session. A library with little artwork, or none, has
/// the sample filled with what the world watches this week, each marked
/// `trending`.
pub async fn splash(
    State(state): State<SharedState>,
    ContentLocale(locale): ContentLocale,
) -> Result<Response, Response> {
    let held = query(&state.db, move |pool| db::splash_entries(&pool, 12, locale)).await?;
    let entries = crate::services::sections::world::with_world(&state, held, SPLASH_COVERS);
    Ok(Json(entries).into_response())
}

/// `GET /api/libraries` → `Library[]`, narrowed to the libraries the caller was
/// granted (ACCT-20).
pub async fn list_libraries(
    State(state): State<SharedState>,
    AuthViewer(viewer): AuthViewer,
) -> Result<Response, Response> {
    let mut libs = query(&state.db, move |pool| db::list_libraries(&pool)).await?;
    libs.retain(|lib| viewer.sees_library(&lib.id));
    Ok(Json(libs).into_response())
}

/// `GET /api/items` (optional `?library=`) → all playable items (movies + episodes).
pub async fn list_items(
    State(state): State<SharedState>,
    AuthViewer(viewer): AuthViewer,
    ContentLocale(locale): ContentLocale,
    Query(q): Query<LibraryQuery>,
) -> Result<Response, Response> {
    let mut items = query(&state.db, move |pool| {
        let mut items = db::list_items(&pool, q.library.as_deref())?;
        db::localize::overlay_items(&pool, &mut items, locale)?;
        Ok(items)
    })
    .await?;
    visibility::keep_items(&state, &viewer, &mut items).await?;
    Ok(Json(items).into_response())
}

/// `GET /api/movies` (optional `?library=`) → `MediaItem[]` (movies only), or
/// with `?view=card` → `MediaCard[]`: the slim shape a grid draws, without
/// files, tracks, cast or crew.
pub async fn list_movies(
    State(state): State<SharedState>,
    AuthViewer(viewer): AuthViewer,
    ContentLocale(locale): ContentLocale,
    Query(q): Query<ListQuery>,
) -> Result<Response, Response> {
    let library = q.library;
    let mut items = query(&state.db, move |pool| {
        let mut items = db::list_movies(&pool, library.as_deref())?;
        db::localize::overlay_items(&pool, &mut items, locale)?;
        Ok(items)
    })
    .await?;
    visibility::keep_items(&state, &viewer, &mut items).await?;
    Ok(items_in_view(items, q.view))
}

/// `items` as JSON, each cut down to a [`MediaCard`] when the caller asked for
/// `?view=card`.
pub fn items_in_view(items: Vec<MediaItem>, view: Option<ListView>) -> Response {
    match view {
        Some(ListView::Card) => {
            let cards: Vec<MediaCard> = items.into_iter().map(MediaCard::from).collect();
            Json(cards).into_response()
        }
        None => Json(items).into_response(),
    }
}

/// `GET /api/shows` (optional `?library=`) → `Show[]`, without cast or crew with
/// `?view=card`. Personalises each show's `progress` (series completion) for the
/// calling account.
pub async fn list_shows(
    State(state): State<SharedState>,
    AuthViewer(viewer): AuthViewer,
    ContentLocale(locale): ContentLocale,
    Query(q): Query<ListQuery>,
) -> Result<Response, Response> {
    let uid = viewer.user.id.clone();
    let library = q.library;
    let mut shows = query(&state.db, move |pool| {
        let mut shows = db::list_shows(&pool, library.as_deref())?;
        let prog = db::show_progress(&pool, &uid).unwrap_or_default();
        for s in &mut shows {
            s.progress = prog.get(&s.id).copied();
        }
        db::localize::overlay_shows(&pool, &mut shows, locale)?;
        Ok(shows)
    })
    .await?;
    visibility::keep_shows(&viewer, &mut shows);
    if matches!(q.view, Some(ListView::Card)) {
        shows = shows.into_iter().map(show_card).collect();
    }
    Ok(Json(shows).into_response())
}

/// `GET /api/shows/:id` → `{ show, seasons[] }`. Fills `show.progress` for the
/// calling account.
pub async fn get_show(
    State(state): State<SharedState>,
    AuthViewer(viewer): AuthViewer,
    ContentLocale(locale): ContentLocale,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    visibility::gate(&state, &viewer, Title::Show(&id)).await?;
    let uid = viewer.user.id.clone();
    let detail = query(&state.db, move |pool| {
        let Some(mut detail) = db::get_show(&pool, &id)? else {
            return Ok(None);
        };
        detail.show.progress = db::show_progress_one(&pool, &uid, &detail.show.id).unwrap_or(None);
        db::localize::overlay_show_detail(&pool, &mut detail, locale)?;
        Ok(Some(detail))
    })
    .await?
    .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "show not found"))?;
    let mut detail = detail;
    viewer.relabel(detail.show.metadata.as_mut());
    Ok(Json(detail).into_response())
}

/// `GET /api/items/:id` → `MediaItem`, whose subtitle list is the tracks inside
/// its file followed by the text subtitle files sitting beside it on disk.
pub async fn get_item(
    State(state): State<SharedState>,
    AuthViewer(viewer): AuthViewer,
    ContentLocale(locale): ContentLocale,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    visibility::gate(&state, &viewer, Title::Item(&id)).await?;
    let beside = state.external_subtitles.clone();
    let item = query(&state.db, move |pool| {
        let Some(mut item) = db::get_item(&pool, &id)? else {
            return Ok(None);
        };
        db::localize::overlay_items(&pool, std::slice::from_mut(&mut item), locale)?;
        beside.attach(&mut item);
        Ok(Some(item))
    })
    .await?
    .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "item not found"))?;
    let mut item = item;
    viewer.relabel(item.metadata.as_mut());
    Ok(Json(item).into_response())
}
