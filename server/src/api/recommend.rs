//! Read-only recommendation rows backed by content embeddings. "For You" is
//! Bearer-scoped to the caller because it reads their watch history; "similar"
//! and "themed" are public.

use axum::extract::{Path, Query, State};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::i18n::ReqLocale;
use crate::model::MediaItem;
use crate::state::SharedState;
use axum::routing::get;
use axum::Router;
use kroma_engine::services::embeddings;

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/items/{id}/similar", get(similar))
        .route("/themed", get(themed))
        .route("/for-you", get(for_you))
}

const ROW_LEN: usize = 30;

/// `GET /api/for-you` — empty until the caller has watched something embeddable.
pub async fn for_you(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    ReqLocale(locale): ReqLocale,
) -> Response {
    match query(&state.db, move |pool| {
        let mut items = db::recommended_for(&pool, &user.id, ROW_LEN)?;
        db::localize::overlay_items(&pool, &mut items, locale)?;
        Ok(items)
    })
    .await
    {
        Ok(items) => Json(items).into_response(),
        Err(resp) => resp,
    }
}

pub async fn similar(
    State(state): State<SharedState>,
    ReqLocale(locale): ReqLocale,
    Path(id): Path<String>,
) -> Response {
    match query(&state.db, move |pool| {
        let mut items = db::similar_items(&pool, &id, ROW_LEN)?;
        db::localize::overlay_items(&pool, &mut items, locale)?;
        Ok(items)
    })
    .await
    {
        Ok(items) => Json(items).into_response(),
        Err(resp) => resp,
    }
}

#[derive(Deserialize)]
pub struct ThemedParams {
    #[serde(default)]
    q: String,
}

/// `GET /api/themed?q=…` — a zero-shot themed row from the nearest titles to the
/// free-text phrase. An empty `q` yields an empty row, never "everything".
pub async fn themed(
    State(state): State<SharedState>,
    ReqLocale(locale): ReqLocale,
    Query(params): Query<ThemedParams>,
) -> Response {
    let q = params.q.trim().to_string();
    if q.is_empty() {
        return Json(Vec::<MediaItem>::new()).into_response();
    }
    // Embed and search together on the blocking pool: embedding is CPU work.
    let embedder = state.embedder.clone();
    match query(&state.db, move |pool| {
        let vec = embeddings::embed(&embedder, &q);
        let mut items =
            db::themed_items(&pool, &vec, ROW_LEN, embeddings::relevance_floor(&embedder))?;
        db::localize::overlay_items(&pool, &mut items, locale)?;
        Ok(items)
    })
    .await
    {
        Ok(items) => Json(items).into_response(),
        Err(resp) => resp,
    }
}
