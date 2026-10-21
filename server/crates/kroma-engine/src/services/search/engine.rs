use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use anyhow::Result;
use tantivy::collector::TopDocs;
use tantivy::schema::Schema;
use tantivy::TantivyDocument;
use tracing::{info, warn};

use super::hit::{collapse_episodes, kind_weight, Hit, HitKind, CANDIDATE_FACTOR, MAX_CANDIDATES};
use super::index::{build_active, field_str, normalize, Active};
use super::query;
use super::schema::{self, Fields};
use crate::db::{self, Pool};
use crate::model::{Kind, MediaItem, Show};
use crate::state::SharedState;

pub struct SearchEngine {
    schema: Schema,
    fields: Fields,
    active: RwLock<Arc<Active>>,
    rebuilding: Mutex<()>,
}

impl SearchEngine {
    /// Searches return nothing until the first rebuild.
    pub fn new() -> Result<Self> {
        let (schema, fields) = schema::build();
        let empty = HashMap::new();
        let active = build_active(
            schema.clone(),
            &fields,
            &[],
            &[],
            &[],
            &empty,
            &empty,
            &empty,
        )?;
        Ok(Self {
            schema,
            fields,
            active: RwLock::new(Arc::new(active)),
            rebuilding: Mutex::new(()),
        })
    }

    /// Rebuild from explicit catalog slices (no translations); production
    /// reindexing goes through [`Self::reindex_from_db`].
    #[cfg_attr(not(test), allow(dead_code))]
    pub fn rebuild(
        &self,
        movies: &[MediaItem],
        shows: &[Show],
        episodes: &[MediaItem],
    ) -> Result<()> {
        let empty = HashMap::new();
        let active = build_active(
            self.schema.clone(),
            &self.fields,
            movies,
            shows,
            episodes,
            &empty,
            &empty,
            &empty,
        )?;
        *self.active.write().unwrap() = Arc::new(active);
        Ok(())
    }

    pub fn reindex_from_db(&self, pool: &Pool) -> Result<()> {
        // One rebuild at a time, snapshot taken under the lock: two overlapping
        // callers would otherwise race to publish, and the one that read the
        // older catalog could land last.
        let _rebuilding = self
            .rebuilding
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let (items, shows) = db::index_snapshot(pool)?;
        let (episodes, movies): (Vec<MediaItem>, Vec<MediaItem>) = items
            .into_iter()
            .partition(|i| matches!(i.kind, Kind::Episode));
        // Every stored language, so a query matches in any of them.
        let tr_movies =
            db::translations::all_for_kind(pool, db::metadata_core::ITEM).unwrap_or_default();
        let tr_eps = db::translations::all_for_kind(pool, "episode").unwrap_or_default();
        let tr_shows =
            db::translations::all_for_kind(pool, db::metadata_core::SHOW).unwrap_or_default();
        let active = build_active(
            self.schema.clone(),
            &self.fields,
            &movies,
            &shows,
            &episodes,
            &tr_movies,
            &tr_eps,
            &tr_shows,
        )?;
        *self.active.write().unwrap() = Arc::new(active);
        Ok(())
    }

    /// Top-`limit` hits for `raw`, best first. Empty for a blank query.
    pub fn search(&self, raw: &str, limit: usize) -> Vec<Hit> {
        let active = self.active.read().unwrap().clone();
        let tokens = normalize(&active._index, raw);
        let searcher = active.reader.searcher();
        let common: Vec<bool> = tokens
            .iter()
            .map(|t| query::is_common(&searcher, &self.fields, t))
            .collect();
        let Some(query) = query::build(&self.fields, &tokens, &common) else {
            return Vec::new();
        };
        let limit = limit.max(1);
        let candidates = limit
            .saturating_mul(CANDIDATE_FACTOR)
            .min(MAX_CANDIDATES)
            .max(limit);
        // tantivy 0.26 removed TopDocs' blanket Collector impl; `.order_by_score()`
        // yields the score-ordered collector.
        let Ok(top) = searcher.search(&query, &TopDocs::with_limit(candidates).order_by_score())
        else {
            return Vec::new();
        };
        let mut scored = Vec::with_capacity(top.len());
        for (score, addr) in top {
            let Ok(doc) = searcher.doc::<TantivyDocument>(addr) else {
                continue;
            };
            let id = field_str(&doc, self.fields.id);
            if id.is_empty() {
                continue;
            }
            let kind = match field_str(&doc, self.fields.kind).as_str() {
                "show" => HitKind::Show,
                "episode" => HitKind::Episode,
                _ => HitKind::Movie,
            };
            let show_id = (kind == HitKind::Episode)
                .then(|| field_str(&doc, self.fields.show_id))
                .filter(|s| !s.is_empty());
            scored.push((Hit { id, kind, show_id }, score * kind_weight(kind)));
        }
        scored.sort_by(|a, b| b.1.total_cmp(&a.1));
        let hits = scored.into_iter().map(|(hit, _)| hit).collect();
        collapse_episodes(hits, limit)
    }
}

/// Never blocks the caller; a failure is logged and the prior index is kept.
pub fn spawn_reindex(state: SharedState) {
    std::thread::spawn(move || match state.search.reindex_from_db(&state.db) {
        Ok(()) => info!("search index rebuilt"),
        Err(e) => warn!(error = %e, "search reindex failed"),
    });
}
