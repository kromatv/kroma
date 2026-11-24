use std::path::PathBuf;

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::Response;

use crate::api::error::json_error;
use crate::api::poster::render_poster;
use crate::api::util::{blocking, query};
use crate::db;
use crate::i18n::ContentLocale;
use crate::model::{Kind, MediaItem};
use crate::services::art_beside;
use crate::state::SharedState;

/// `GET /api/shows/:id/poster` → the poster kept in the show's folder, else an
/// inline SVG placeholder. A client asks here for a show with no fetched poster.
pub async fn show_poster(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    let id2 = id.clone();
    let title = query(&state.db, move |pool| db::show_title(&pool, &id2))
        .await?
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "show not found"))?;
    let beside = show_poster_beside(&state, id.clone()).await?;
    Ok(picture_or_placeholder(beside, &id, &title).await)
}

/// `GET /api/items/:id/poster` → for an episode, its show's real poster, else the
/// one kept in the show's folder; for a film, the one kept beside its files; else
/// an inline SVG placeholder. Episodes have no poster of their own (enrichment
/// only gives a still), so any poster rail (My List, search) shows the show's art.
pub async fn item_poster(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    ContentLocale(locale): ContentLocale,
) -> Result<Response, Response> {
    let item = localized_item(&state, id.clone(), locale).await?;
    let beside = match (&item.kind, item.show_id.clone()) {
        (Kind::Episode, Some(show_id)) => {
            if let Some(url) = show_art(&state, show_id.clone(), locale).await? {
                return Ok(redirect_to_art(&url));
            }
            show_poster_beside(&state, show_id).await?
        }
        (Kind::Episode, None) => None,
        _ => film_poster_beside(&state, &item).await?,
    };
    Ok(picture_or_placeholder(beside, &id, &item.title).await)
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
        let Some(mut meta) = db::show_metadata(&pool, &show_id)? else {
            return Ok(None);
        };
        db::localize::overlay_show_metadata(&pool, &show_id, &mut meta, locale)?;
        Ok(meta.poster_url)
    })
    .await
}

async fn show_poster_beside(
    state: &SharedState,
    show_id: String,
) -> Result<Option<PathBuf>, Response> {
    let data_dir = state.config.data_dir.clone();
    query(&state.db, move |pool| {
        let episodes: Vec<PathBuf> = db::show_file_paths(&pool, &show_id)?
            .into_iter()
            .map(PathBuf::from)
            .collect();
        Ok(art_beside::show_poster(&data_dir, &episodes))
    })
    .await
}

async fn film_poster_beside(
    state: &SharedState,
    item: &MediaItem,
) -> Result<Option<PathBuf>, Response> {
    let videos: Vec<PathBuf> = item
        .files
        .iter()
        .filter_map(|file| file.abs_path.as_deref())
        .map(PathBuf::from)
        .collect();
    let data_dir = state.config.data_dir.clone();
    blocking(move || Ok(art_beside::film_poster(&data_dir, &videos))).await
}

async fn picture_or_placeholder(picture: Option<PathBuf>, id: &str, title: &str) -> Response {
    let bytes = match picture {
        Some(picture) => tokio::fs::read(picture).await.ok(),
        None => None,
    };
    let Some(bytes) = bytes else {
        return render_poster(id, title);
    };
    Response::builder()
        .header(header::CONTENT_TYPE, "image/webp")
        .header(header::CACHE_CONTROL, "public, max-age=86400")
        .body(Body::from(bytes))
        .unwrap()
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
