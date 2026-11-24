use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::Response;

use crate::api::error::json_error;
use crate::api::poster::render_poster;
use crate::api::util::query;
use crate::db;
use crate::db::metadata_core::{ITEM, SHOW};
use crate::i18n::ContentLocale;
use crate::model::{Kind, MediaItem};
use crate::state::SharedState;

/// `GET /api/shows/:id/poster` → the show's poster, the one kept in its folder
/// first, else an inline SVG placeholder.
pub async fn show_poster(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    ContentLocale(locale): ContentLocale,
) -> Result<Response, Response> {
    let id2 = id.clone();
    let title = query(&state.db, move |pool| db::show_title(&pool, &id2))
        .await?
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "show not found"))?;
    let art = show_art(&state, id.clone(), locale).await?;
    Ok(art_or_placeholder(art, &id, &title))
}

/// `GET /api/items/:id/poster` → for an episode, its show's poster; for a film,
/// its own, the one kept beside its files first; else an inline SVG
/// placeholder. Episodes have no poster of their own (enrichment only gives a
/// still), so any poster rail (My List, search) shows the show's art.
pub async fn item_poster(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    ContentLocale(locale): ContentLocale,
) -> Result<Response, Response> {
    let item = localized_item(&state, id.clone(), locale).await?;
    let art = match (&item.kind, item.show_id.clone()) {
        (Kind::Episode, Some(show_id)) => show_art(&state, show_id, locale).await?,
        (Kind::Episode, None) => None,
        _ => film_art(&state, &item).await?,
    };
    Ok(art_or_placeholder(art, &id, &item.title))
}

pub(super) async fn localized_item(
    state: &SharedState,
    id: String,
    locale: &'static str,
) -> Result<MediaItem, Response> {
    query(&state.db, move |pool| {
        let Some(mut item) = db::get_item(&pool, &id)? else {
            return Ok(None);
        };
        db::localize::overlay_each(&pool, std::iter::once(&mut item), locale)?;
        Ok(Some(item))
    })
    .await?
    .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "item not found"))
}

async fn show_art(
    state: &SharedState,
    show_id: String,
    locale: &'static str,
) -> Result<Option<String>, Response> {
    query(&state.db, move |pool| {
        if let Some(mut meta) = db::show_metadata(&pool, &show_id)? {
            db::localize::overlay_show_metadata(&pool, &show_id, &mut meta, locale)?;
            if meta.poster_url.is_some() {
                return Ok(meta.poster_url);
            }
        }
        db::art_beside::poster_of(&pool, SHOW, &show_id)
    })
    .await
}

async fn film_art(state: &SharedState, item: &MediaItem) -> Result<Option<String>, Response> {
    if let Some(url) = item.metadata.as_ref().and_then(|m| m.poster_url.clone()) {
        return Ok(Some(url));
    }
    let id = item.id.clone();
    query(&state.db, move |pool| {
        db::art_beside::poster_of(&pool, ITEM, &id)
    })
    .await
}

fn art_or_placeholder(art: Option<String>, id: &str, title: &str) -> Response {
    match art {
        Some(url) => redirect_to_art(&url),
        None => render_poster(id, title),
    }
}

// Cached for a day like the placeholder — the target is content-addressed, so a
// stale redirect still resolves.
fn redirect_to_art(url: &str) -> Response {
    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, url)
        .header(header::CACHE_CONTROL, "public, max-age=86400")
        .body(Body::empty())
        .unwrap()
}
