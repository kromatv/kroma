//! `GET /api/search` full-text catalogue search (movies, shows, episodes).
//!
//! The match + ranking happens in-memory in [`crate::services::search`]; this
//! handler hydrates the ranked ids into full DTOs (the same shapes `/movies` and
//! `/shows` return) so clients render results with their existing card UI.

use std::collections::HashMap;

use axum::extract::{Query, State};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::dto::{SearchHit, SearchResponse};
use crate::api::util::query;
use crate::db;
use crate::i18n::ReqLocale;
use crate::services::search::{Hit, HitKind};
use crate::state::SharedState;
use axum::routing::get;
use axum::Router;

pub fn routes() -> Router<SharedState> {
    Router::new().route("/search", get(search))
}

const DEFAULT_LIMIT: usize = 30;
const MAX_LIMIT: usize = 60;
// The engine builds ~12 fuzzy/prefix subqueries per token; an unbounded `q` is a
// CPU-exhaustion vector on a NAS-class box, so cap it well above any real query.
const MAX_QUERY_CHARS: usize = 128;

#[derive(Debug, Deserialize)]
pub struct SearchParams {
    pub q: Option<String>,
    pub limit: Option<usize>,
    pub library: Option<String>,
}

/// `GET /api/search?q=&limit=&library=` → ranked [`SearchResponse`].
pub async fn search(
    State(state): State<SharedState>,
    ReqLocale(locale): ReqLocale,
    Query(p): Query<SearchParams>,
) -> Result<Response, Response> {
    let q: String = p.q.unwrap_or_default().trim().chars().take(MAX_QUERY_CHARS).collect();
    let limit = p.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let library = p.library;

    if q.is_empty() {
        return Ok(Json(SearchResponse { query: q, results: Vec::new() }).into_response());
    }

    let engine = state.search.clone();
    let resp = query(&state.db, move |pool| {
        let hits = engine.search(&q, limit);
        let results = hydrate(&pool, hits, library.as_deref(), locale)?;
        Ok(SearchResponse { query: q, results })
    })
    .await?;
    Ok(Json(resp).into_response())
}

fn hydrate(pool: &db::Pool, hits: Vec<Hit>, library: Option<&str>, locale: &str) -> anyhow::Result<Vec<SearchHit>> {
    let item_ids: Vec<String> =
        hits.iter().filter(|h| h.kind != HitKind::Show).map(|h| h.id.clone()).collect();
    let show_ids: Vec<String> =
        hits.iter().filter(|h| h.kind == HitKind::Show).map(|h| h.id.clone()).collect();

    let mut item_vec = db::get_items_by_ids(pool, &item_ids)?;
    db::localize::overlay_items(pool, &mut item_vec, locale)?;
    let mut items: HashMap<String, _> =
        item_vec.into_iter().map(|i| (i.id.clone(), i)).collect();
    let mut show_vec = db::get_shows_by_ids(pool, &show_ids)?;
    db::localize::overlay_shows(pool, &mut show_vec, locale)?;
    let mut shows: HashMap<String, _> =
        show_vec.into_iter().map(|s| (s.id.clone(), s)).collect();

    let in_library = |lib: &str| library.is_none_or(|want| lib == want);

    let mut out = Vec::with_capacity(hits.len());
    for hit in hits {
        match hit.kind {
            HitKind::Show => {
                if let Some(show) = shows.remove(&hit.id).filter(|s| in_library(&s.library)) {
                    out.push(SearchHit::Show { show });
                }
            }
            HitKind::Movie | HitKind::Episode => {
                if let Some(item) = items.remove(&hit.id).filter(|i| in_library(&i.library)) {
                    out.push(if hit.kind == HitKind::Episode {
                        SearchHit::Episode { item }
                    } else {
                        SearchHit::Movie { item }
                    });
                }
            }
        }
    }
    Ok(out)
}
