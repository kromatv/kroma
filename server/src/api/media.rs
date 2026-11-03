//! Catalogue browse + detail endpoints (libraries / items / movies / shows) and
//! the sign-in screen's splash sample.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::error::json_error;
use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::api::visibility;
use crate::db;
use crate::i18n::ReqLocale;
use crate::model::MediaCard;
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
pub struct MovieListQuery {
    pub library: Option<String>,
    pub view: Option<ListView>,
}

/// `GET /api/splash` → `SplashEntry[]`: a random sample of backdrop art with
/// title/year captions, for the sign-in screen's ambient slideshow. The
/// sample is small and random on every call, so the catalogue stays
/// unlistable without a session.
pub async fn splash(
    State(state): State<SharedState>,
    ReqLocale(locale): ReqLocale,
) -> Result<Response, Response> {
    let entries = query(&state.db, move |pool| db::splash_entries(&pool, 12, locale)).await?;
    Ok(Json(entries).into_response())
}

/// `GET /api/libraries` → `Library[]`, narrowed to the libraries the caller was
/// granted (ACCT-20).
pub async fn list_libraries(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    let mut libs = query(&state.db, move |pool| db::list_libraries(&pool)).await?;
    if !user.sees_every_library() {
        libs.retain(|lib| user.sees_library(&lib.id));
    }
    Ok(Json(libs).into_response())
}

/// `GET /api/items` (optional `?library=`) → all playable items (movies + episodes).
pub async fn list_items(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    ReqLocale(locale): ReqLocale,
    Query(q): Query<LibraryQuery>,
) -> Result<Response, Response> {
    let mut items = query(&state.db, move |pool| {
        let mut items = db::list_items(&pool, q.library.as_deref())?;
        db::localize::overlay_items(&pool, &mut items, locale)?;
        Ok(items)
    })
    .await?;
    visibility::keep_items(&user, &mut items);
    Ok(Json(items).into_response())
}

/// `GET /api/movies` (optional `?library=`) → `MediaItem[]` (movies only), or
/// with `?view=card` → `MediaCard[]`: the slim shape a grid draws, without
/// files, tracks, cast or crew.
pub async fn list_movies(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    ReqLocale(locale): ReqLocale,
    Query(q): Query<MovieListQuery>,
) -> Result<Response, Response> {
    let library = q.library;
    let mut items = query(&state.db, move |pool| {
        let mut items = db::list_movies(&pool, library.as_deref())?;
        db::localize::overlay_items(&pool, &mut items, locale)?;
        Ok(items)
    })
    .await?;
    visibility::keep_items(&user, &mut items);
    Ok(match q.view {
        Some(ListView::Card) => {
            let cards: Vec<MediaCard> = items.into_iter().map(MediaCard::from).collect();
            Json(cards).into_response()
        }
        None => Json(items).into_response(),
    })
}

/// `GET /api/shows` (optional `?library=`) → `Show[]`. Personalises each show's
/// `progress` (series completion) for the calling account.
pub async fn list_shows(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    ReqLocale(locale): ReqLocale,
    Query(q): Query<LibraryQuery>,
) -> Result<Response, Response> {
    let uid = user.id.clone();
    let mut shows = query(&state.db, move |pool| {
        let mut shows = db::list_shows(&pool, q.library.as_deref())?;
        let prog = db::show_progress(&pool, &uid).unwrap_or_default();
        for s in &mut shows {
            s.progress = prog.get(&s.id).copied();
        }
        db::localize::overlay_shows(&pool, &mut shows, locale)?;
        Ok(shows)
    })
    .await?;
    visibility::keep_shows(&user, &mut shows);
    Ok(Json(shows).into_response())
}

/// `GET /api/shows/:id` → `{ show, seasons[] }`. Fills `show.progress` for the
/// calling account.
pub async fn get_show(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    ReqLocale(locale): ReqLocale,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    visibility::gate_show(&state, &user, &id).await?;
    let uid = user.id;
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
    Ok(Json(detail).into_response())
}

/// `GET /api/items/:id` → `MediaItem`, whose subtitle list is the tracks inside
/// its file followed by the text subtitle files sitting beside it on disk.
pub async fn get_item(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    ReqLocale(locale): ReqLocale,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    visibility::gate_item(&state, &user, &id).await?;
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
    Ok(Json(item).into_response())
}
