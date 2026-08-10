//! Artwork endpoints: inline SVG poster placeholders, locally-cached WebP/JPEG
//! artwork, and the composited landscape "card" JPEG for Samsung TV preview tiles.

use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::Response;
use serde::Deserialize;

use crate::api::error::json_error;
use crate::api::poster::render_poster;
use crate::api::util::{blocking, query};
use crate::db;
use crate::model::Kind;
use crate::state::SharedState;
use axum::routing::get;
use axum::Router;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/shows/{id}/poster", get(show_poster))
        .route("/items/{id}/poster", get(item_poster))
        .route("/items/{id}/card", get(item_card))
        .route("/images/{name}", get(image))
}

/// `GET /api/shows/:id/poster` → inline SVG placeholder.
pub async fn show_poster(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    let id2 = id.clone();
    let title = query(&state.db, move |pool| db::show_title(&pool, &id2))
        .await?
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "show not found"))?;
    Ok(render_poster(&id, &title))
}

/// `GET /api/items/:id/poster` → the show's real poster for an episode, else the
/// inline SVG placeholder. Episodes have no poster of their own (enrichment only
/// gives a still), so any poster rail (My List, search) shows the show's art.
pub async fn item_poster(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> Result<Response, Response> {
    let id2 = id.clone();
    let item = query(&state.db, move |pool| db::get_item(&pool, &id2))
        .await?
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "item not found"))?;
    if item.kind == Kind::Episode {
        if let Some(show_id) = item.show_id.clone() {
            let art = query(&state.db, move |pool| db::show_poster_art(&pool, &show_id)).await?;
            if let Some(url) = art {
                return Ok(redirect_to_art(&url));
            }
        }
    }
    Ok(render_poster(&id, &item.title))
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

// A fixed bucket set keeps the on-disk cache bounded and lets clients asking
// for similar widths share a rendition. 960 is the top rung because a backdrop
// master is a TMDB w1280 (see `infra::metadata::client`): a wider bucket would
// re-encode the master at its own size rather than downscale it.
const IMAGE_WIDTHS: [u32; 6] = [160, 240, 320, 480, 780, 960];

const WIDEST_IMAGE: u32 = IMAGE_WIDTHS[IMAGE_WIDTHS.len() - 1];

// Past the widest bucket there is nothing sharper to serve, so the ask is
// capped instead of falling through to the master: one rendition, one URL.
fn bucket_for(width: u32) -> u32 {
    IMAGE_WIDTHS.iter().copied().find(|b| *b >= width).unwrap_or(WIDEST_IMAGE)
}

#[derive(Debug, Deserialize)]
pub struct ImageQuery {
    pub w: Option<u32>,
}

/// `GET /api/images/:name?w=` → locally-cached WebP artwork (poster/backdrop).
/// `?w=` snaps up to the next [`IMAGE_WIDTHS`] bucket and is capped at the
/// widest one; omit it for the stored master. Immutable, content-addressed
/// filenames → cache forever.
pub async fn image(
    State(state): State<SharedState>,
    Path(name): Path<String>,
    Query(q): Query<ImageQuery>,
) -> Response {
    // Reject anything but a simple cache filename (no path traversal).
    let safe = !name.is_empty()
        && !name.contains("..")
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'));
    if !safe {
        return json_error(StatusCode::BAD_REQUEST, "invalid image name");
    }

    // Sized rendition: produced once (cwebp/ffmpeg, on the blocking pool), then
    // served from disk forever. Falls through to the original on any failure.
    if let Some(resp) = sized_rendition_response(&state, &name, &q).await {
        return resp;
    }

    // JPEG rendition for Samsung TV preview tiles (the carousel rejects WebP).
    // `<hash>.webp.jpg` → transcode the cached `<hash>.webp` on demand.
    if let Some(resp) = jpeg_rendition_response(&state, &name).await {
        return resp;
    }

    let path = crate::infra::image::images_dir(&state.config.data_dir).join(&name);
    match tokio::fs::read(&path).await {
        Ok(bytes) => image_response(bytes, content_type_for(&name)),
        Err(_) => json_error(StatusCode::NOT_FOUND, "image not found"),
    }
}

async fn sized_rendition_response(state: &SharedState, name: &str, q: &ImageQuery) -> Option<Response> {
    let w = q.w.filter(|_| name.ends_with(".webp"))?;
    let width = bucket_for(w);
    let data_dir = state.config.data_dir.clone();
    let sized_name = name.to_string();
    let made =
        blocking(move || Ok(crate::infra::image::sized_rendition(&data_dir, &sized_name, width))).await;
    let Ok(Some((path, content_type))) = made else {
        return None;
    };
    let bytes = tokio::fs::read(&path).await.ok()?;
    Some(image_response(bytes, content_type))
}

async fn jpeg_rendition_response(state: &SharedState, name: &str) -> Option<Response> {
    let webp = name.strip_suffix(".jpg").filter(|s| s.ends_with(".webp"))?;
    let data_dir = state.config.data_dir.clone();
    let webp = webp.to_string();
    let made = blocking(move || Ok(crate::infra::image::jpeg_rendition(&data_dir, &webp))).await;
    Some(match made {
        Ok(Some(jpg)) => match tokio::fs::read(&jpg).await {
            Ok(bytes) => image_response(bytes, "image/jpeg"),
            Err(_) => json_error(StatusCode::NOT_FOUND, "image not found"),
        },
        _ => json_error(StatusCode::NOT_FOUND, "image not found"),
    })
}

fn content_type_for(name: &str) -> &'static str {
    if name.ends_with(".png") {
        "image/png"
    } else if name.ends_with(".jpg") || name.ends_with(".jpeg") {
        "image/jpeg"
    } else {
        "image/webp"
    }
}

fn image_response(bytes: Vec<u8>, content_type: &str) -> Response {
    Response::builder()
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .body(Body::from(bytes))
        .unwrap()
}

#[derive(Debug, Deserialize)]
pub struct CardQuery {
    pub label: Option<String>,
    pub progress: Option<f32>,
    pub w: Option<u32>,
}

/// `GET /api/items/:id/card?label=&progress=&w=` → a 16:9 landscape JPEG "card"
/// (backdrop + category badge + KROMA brand logo + title-treatment logo):
/// 640×360 for Samsung TV Smart Hub preview tiles, 1280×720 (`w>640`) for the
/// Apple TV Top Shelf.
pub async fn item_card(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    Query(q): Query<CardQuery>,
) -> Result<Response, Response> {
    let item = query(&state.db, move |pool| db::get_item(&pool, &id))
        .await?
        .ok_or_else(|| json_error(StatusCode::NOT_FOUND, "item not found"))?;

    // An episode's own metadata holds only its w300 still (in `backdropUrl`),
    // which upscales badly and has no title logo: art and logo come from the
    // show instead, so an episode card looks like a movie card.
    let show_meta = match (item.kind, item.show_id.clone()) {
        (Kind::Episode, Some(show_id)) => {
            query(&state.db, move |pool| db::show_metadata(&pool, &show_id)).await?
        }
        _ => None,
    };
    let show_meta = show_meta.as_ref();

    // Prefer the 16:9 backdrop; fall back to the episode still, then the
    // poster. All must be locally cached (a `/api/images/<hash>.webp` path)
    // to composite.
    let meta = item.metadata.as_ref();
    let webp = show_meta
        .and_then(|m| m.backdrop_url.as_deref())
        .and_then(cache_name)
        .or_else(|| meta.and_then(|m| m.backdrop_url.as_deref()).and_then(cache_name))
        .or_else(|| meta.and_then(|m| m.poster_url.as_deref()).and_then(cache_name))
        .or_else(|| show_meta.and_then(|m| m.poster_url.as_deref()).and_then(cache_name))
        .map(str::to_string);
    let Some(webp) = webp else {
        return Err(json_error(StatusCode::NOT_FOUND, "no artwork for card"));
    };

    // Optional title-treatment logo (cached PNG → bounded overlay PNG).
    let logo = meta
        .and_then(|m| m.logo_url.as_deref())
        .or_else(|| show_meta.and_then(|m| m.logo_url.as_deref()))
        .and_then(cache_name)
        .map(str::to_string);

    let label = q.label.unwrap_or_default();
    let progress = q.progress;
    let scale: u32 = if q.w.unwrap_or(640) > 640 { 2 } else { 1 };
    let data_dir = state.config.data_dir.clone();

    let rendered = blocking(move || {
        let Some(base_path) = crate::infra::image::card_base_png(&data_dir, &webp, scale) else {
            return Ok(None);
        };
        let base = std::fs::read(&base_path)?;
        let logo_bytes = logo
            .and_then(|name| crate::infra::image::card_logo_png(&data_dir, &name, scale))
            .and_then(|path| std::fs::read(&path).ok());
        Ok(crate::api::card::render(&crate::api::card::Card {
            base_png: &base,
            label: &label,
            logo_png: logo_bytes.as_deref(),
            progress,
        }))
    })
    .await?;

    let resp = match rendered {
        Some(jpg) => image_response(jpg, "image/jpeg"),
        None => json_error(StatusCode::NOT_FOUND, "artwork unavailable"),
    };
    Ok(resp)
}

fn cache_name(url: &str) -> Option<&str> {
    url.strip_prefix(crate::infra::image::PUBLIC_PREFIX)
}

#[cfg(test)]
mod tests {
    use super::{bucket_for, IMAGE_WIDTHS};

    #[test]
    fn a_width_snaps_up_to_the_next_bucket() {
        assert!(IMAGE_WIDTHS.windows(2).all(|pair| pair[0] < pair[1]));
        assert_eq!(bucket_for(0), 160);
        assert_eq!(bucket_for(160), 160);
        assert_eq!(bucket_for(161), 240);
        assert_eq!(bucket_for(240), 240);
        assert_eq!(bucket_for(241), 320);
        assert_eq!(bucket_for(720), 780);
        assert_eq!(bucket_for(781), 960);
        assert_eq!(bucket_for(960), 960);
    }

    #[test]
    fn an_ask_past_the_widest_bucket_is_capped_rather_than_served_the_master() {
        assert_eq!(bucket_for(1280), 960);
        assert_eq!(bucket_for(2560), 960);
        assert_eq!(bucket_for(u32::MAX), 960);
    }
}
