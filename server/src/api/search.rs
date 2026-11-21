//! `GET /api/search` full-text catalogue search (movies, shows, episodes).
//!
//! The match + ranking happens in-memory in [`crate::services::search`]; this
//! handler hydrates the ranked ids into full DTOs (the same shapes `/movies` and
//! `/shows` return) so clients render results with their existing card UI.

use std::collections::{HashMap, HashSet};

use axum::extract::{Query, State};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use crate::api::dto::{one_per_title, PersonHit, SearchHit, SearchResponse};
use crate::api::media::ListView;
use crate::api::util::query;
use crate::api::visibility::{self, AuthViewer, Viewer};
use crate::db;
use crate::i18n::ContentLocale;
use crate::model::{SectionItem, User};
use crate::services::embeddings;
use crate::services::search::{Asker, Hit, HitKind};
use crate::services::settings;
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

const IN_PROGRESS: f32 = 1.3;
const SAVED: f32 = 1.15;

const THIN: usize = 3;
const BY_MEANING: usize = 12;
const MIN_WORDS_FOR_MEANING: usize = 2;

#[derive(Debug, Deserialize)]
pub struct SearchParams {
    pub q: Option<String>,
    pub limit: Option<usize>,
    pub library: Option<String>,
    pub view: Option<ListView>,
}

/// `GET /api/search?q=&limit=&library=&view=` → ranked [`SearchResponse`]. With
/// `view=card` every hit is slimmed to what a poster draws.
pub async fn search(
    State(state): State<SharedState>,
    AuthViewer(viewer): AuthViewer,
    ContentLocale(locale): ContentLocale,
    Query(p): Query<SearchParams>,
) -> Result<Response, Response> {
    let q: String =
        p.q.unwrap_or_default()
            .trim()
            .chars()
            .take(MAX_QUERY_CHARS)
            .collect();
    let limit = p.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let library = p.library;
    let card = matches!(p.view, Some(ListView::Card));

    if q.is_empty() {
        return Ok(Json(SearchResponse {
            query: q,
            results: Vec::new(),
            people: Vec::new(),
        })
        .into_response());
    }

    let titles = visibility::seen_titles(&state, &viewer).await?;
    let engine = state.clone();
    let resp = query(&state.db, move |pool| {
        let favoured = favoured(&engine, &pool, &viewer.user);
        let visible = |lib: &str| {
            library.as_deref().is_none_or(|want| lib == want) && viewer.sees_library(lib)
        };
        let asker = Asker {
            visible: &visible,
            titles: titles.as_ref(),
            favoured: &favoured,
        };
        let answer = engine.search.answer(&q, limit, &asker);
        let mut results = one_per_title(hydrate(&pool, answer.hits, locale)?);
        if results.len() < THIN && q.split_whitespace().count() >= MIN_WORDS_FOR_MEANING {
            let kept = |entry: &SectionItem| visible(library_of(entry)) && viewer.sees_entry(entry);
            by_meaning(&engine, &pool, (&q, locale), &kept, &mut results);
        }
        relabel(&viewer, &mut results);
        if card {
            results = results.into_iter().map(SearchHit::into_card).collect();
        }
        let people = answer.people.into_iter().map(PersonHit::from).collect();
        Ok(SearchResponse {
            query: q,
            results,
            people,
        })
    })
    .await?;
    Ok(Json(resp).into_response())
}

fn favoured(state: &SharedState, pool: &db::Pool, user: &User) -> HashMap<String, f32> {
    let played = settings::played_percent(&state.settings);
    let mut out: HashMap<String, f32> = db::list_my_list(pool, &user.id)
        .unwrap_or_default()
        .into_iter()
        .map(|id| (id, SAVED))
        .collect();
    for id in db::continue_watching_ids(pool, &user.id, played).unwrap_or_default() {
        out.insert(id, IN_PROGRESS);
    }
    out
}

fn hydrate(pool: &db::Pool, hits: Vec<Hit>, locale: &str) -> anyhow::Result<Vec<SearchHit>> {
    let item_ids: Vec<String> = hits
        .iter()
        .filter(|h| h.kind != HitKind::Show)
        .map(|h| h.id.clone())
        .collect();
    let show_ids: Vec<String> = hits
        .iter()
        .filter(|h| h.kind == HitKind::Show)
        .map(|h| h.id.clone())
        .collect();

    let mut item_vec = db::get_items_by_ids(pool, &item_ids)?;
    db::localize::overlay_items(pool, &mut item_vec, locale)?;
    let mut items: HashMap<String, _> = item_vec.into_iter().map(|i| (i.id.clone(), i)).collect();
    let mut show_vec = db::get_shows_by_ids(pool, &show_ids)?;
    db::localize::overlay_shows(pool, &mut show_vec, locale)?;
    let mut shows: HashMap<String, _> = show_vec.into_iter().map(|s| (s.id.clone(), s)).collect();

    let mut out = Vec::with_capacity(hits.len());
    for hit in hits {
        match hit.kind {
            HitKind::Show => {
                if let Some(show) = shows.remove(&hit.id) {
                    out.push(SearchHit::Show { show });
                }
            }
            HitKind::Movie | HitKind::Episode => {
                if let Some(item) = items.remove(&hit.id) {
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

fn relabel(viewer: &Viewer, results: &mut [SearchHit]) {
    for hit in results {
        viewer.relabel(hit.metadata_mut());
    }
}

fn library_of(entry: &SectionItem) -> &str {
    match entry {
        SectionItem::Movie { item } => &item.library,
        SectionItem::Show { show } => &show.library,
    }
}

fn by_meaning(
    state: &SharedState,
    pool: &db::Pool,
    (q, locale): (&str, &str),
    kept: &dyn Fn(&SectionItem) -> bool,
    results: &mut Vec<SearchHit>,
) {
    let floor = embeddings::relevance_floor(&state.embedder);
    if floor >= 1.0 {
        return;
    }
    let vector = embeddings::embed(&state.embedder, q);
    if vector.is_empty() || state.vectors.refresh_if_stale(pool).is_err() {
        return;
    }
    let have: HashSet<String> = results.iter().map(|hit| hit.id().to_string()).collect();
    let near: Vec<String> = state
        .vectors
        .nearest(&vector, BY_MEANING, &HashSet::new())
        .into_iter()
        .filter(|(id, score)| *score >= floor && !have.contains(id))
        .map(|(id, _)| id)
        .collect();
    let ids: Vec<&str> = near.iter().map(String::as_str).collect();
    let Ok(mut entries) = db::entities_by_ids(pool, &ids) else {
        return;
    };
    let _ = db::localize::overlay_section_items(pool, &mut entries, locale);
    for entry in entries.into_iter().filter(|entry| kept(entry)) {
        match entry {
            SectionItem::Movie { item } => {
                results.push(SearchHit::Movie { item: *item });
            }
            SectionItem::Show { show } => {
                results.push(SearchHit::Show { show: *show });
            }
        }
    }
}
