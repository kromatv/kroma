//! Keyword/typo-tolerant search over the catalogue: a tantivy index in a
//! `RamDirectory`, rebuilt from SQLite on every library change. A rebuild
//! constructs a new index and swaps it in, so searches never see a half-built
//! one. The semantic "more like this" recommender lives in [`crate::db`].

mod query;
mod schema;

use std::collections::HashSet;
use std::sync::{Arc, Mutex, RwLock};

use anyhow::Result;
use tantivy::collector::TopDocs;
use tantivy::schema::{Field, Schema, Value};
use tantivy::{Index, IndexReader, IndexWriter, ReloadPolicy, TantivyDocument};
use tracing::{info, warn};

use std::collections::HashMap;

use crate::db::translations::TransData;
use crate::db::{self, Pool};
use crate::model::{Kind, MediaItem, Metadata, Show};
use crate::state::SharedState;

use schema::{Fields, ANALYZER};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum HitKind {
    Movie,
    Show,
    Episode,
}

/// Hits come back sorted by descending relevance, so the position is the rank.
pub struct Hit {
    pub id: String,
    pub kind: HitKind,
    /// Set on an episode: the show it belongs to.
    pub show_id: Option<String>,
}

// A show title lives on every one of its episodes, so a query naming the show
// matches the whole season list. Collect several pages' worth of raw hits, fold
// the episodes back under their show, and only then cut to `limit`.
const CANDIDATE_FACTOR: usize = 8;
const MAX_CANDIDATES: usize = 400;
// A show that did NOT match itself is represented by its best few episodes.
const MAX_EPISODES_PER_SHOW: usize = 3;

struct Active {
    reader: IndexReader,
    // Held so the in-RAM directory and its registered tokenizer outlive `reader`.
    _index: Index,
}

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
        let active =
            build_active(schema.clone(), &fields, &[], &[], &[], &empty, &empty, &empty)?;
        Ok(Self { schema, fields, active: RwLock::new(Arc::new(active)), rebuilding: Mutex::new(()) })
    }

    /// Rebuild from explicit catalog slices (no translations); production
    /// reindexing goes through [`Self::reindex_from_db`].
    #[cfg_attr(not(test), allow(dead_code))]
    pub fn rebuild(&self, movies: &[MediaItem], shows: &[Show], episodes: &[MediaItem]) -> Result<()> {
        let empty = HashMap::new();
        let active =
            build_active(self.schema.clone(), &self.fields, movies, shows, episodes, &empty, &empty, &empty)?;
        *self.active.write().unwrap() = Arc::new(active);
        Ok(())
    }

    pub fn reindex_from_db(&self, pool: &Pool) -> Result<()> {
        // One rebuild at a time, snapshot taken under the lock: two overlapping
        // callers would otherwise race to publish, and the one that read the
        // older catalog could land last.
        let _rebuilding = self.rebuilding.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let (items, shows) = db::index_snapshot(pool)?;
        let (episodes, movies): (Vec<MediaItem>, Vec<MediaItem>) =
            items.into_iter().partition(|i| matches!(i.kind, Kind::Episode));
        // Every stored language, so a query matches in any of them.
        let tr_movies = db::translations::all_for_kind(pool, db::metadata_core::ITEM).unwrap_or_default();
        let tr_eps = db::translations::all_for_kind(pool, "episode").unwrap_or_default();
        let tr_shows = db::translations::all_for_kind(pool, db::metadata_core::SHOW).unwrap_or_default();
        let active = build_active(
            self.schema.clone(), &self.fields, &movies, &shows, &episodes, &tr_movies, &tr_eps,
            &tr_shows,
        )?;
        *self.active.write().unwrap() = Arc::new(active);
        Ok(())
    }

    /// Top-`limit` hits for `raw`, best first. Empty for a blank query.
    pub fn search(&self, raw: &str, limit: usize) -> Vec<Hit> {
        let active = self.active.read().unwrap().clone();
        let tokens = normalize(&active._index, raw);
        let Some(query) = query::build(&self.fields, &tokens) else {
            return Vec::new();
        };
        let searcher = active.reader.searcher();
        let limit = limit.max(1);
        let candidates = limit.saturating_mul(CANDIDATE_FACTOR).min(MAX_CANDIDATES).max(limit);
        // tantivy 0.26 removed TopDocs' blanket Collector impl; `.order_by_score()`
        // yields the score-ordered collector.
        let Ok(top) = searcher.search(&query, &TopDocs::with_limit(candidates).order_by_score())
        else {
            return Vec::new();
        };
        let mut hits = Vec::with_capacity(top.len());
        for (_score, addr) in top {
            let Ok(doc) = searcher.doc::<TantivyDocument>(addr) else { continue };
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
            hits.push(Hit { id, kind, show_id });
        }
        collapse_episodes(hits, limit)
    }
}

/// Drops every episode whose show is itself a hit, caps what is left at
/// [`MAX_EPISODES_PER_SHOW`] per show, and truncates to `limit`. Relevance order
/// is preserved, so a show keeps the rank its own document earned.
fn collapse_episodes(hits: Vec<Hit>, limit: usize) -> Vec<Hit> {
    let shows: HashSet<String> =
        hits.iter().filter(|h| h.kind == HitKind::Show).map(|h| h.id.clone()).collect();
    let mut kept_per_show: HashMap<String, usize> = HashMap::new();
    let mut out = Vec::with_capacity(limit);
    for hit in hits {
        if out.len() == limit {
            break;
        }
        if let Some(show_id) = hit.show_id.as_deref() {
            if shows.contains(show_id) {
                continue;
            }
            let kept = kept_per_show.entry(show_id.to_string()).or_default();
            if *kept >= MAX_EPISODES_PER_SHOW {
                continue;
            }
            *kept += 1;
        }
        out.push(hit);
    }
    out
}

#[allow(clippy::too_many_arguments)]
fn build_active(
    schema: Schema,
    fields: &Fields,
    movies: &[MediaItem],
    shows: &[Show],
    episodes: &[MediaItem],
    tr_movies: &HashMap<String, Vec<TransData>>,
    tr_eps: &HashMap<String, Vec<TransData>>,
    tr_shows: &HashMap<String, Vec<TransData>>,
) -> Result<Active> {
    let index = schema::new_index(schema);
    let mut writer: IndexWriter = index.writer_with_num_threads(1, 15_000_000)?;
    for m in movies {
        add_item(&mut writer, fields, m, "movie", tr_movies.get(&m.id));
    }
    for e in episodes {
        add_item(&mut writer, fields, e, "episode", tr_eps.get(&e.id));
    }
    for s in shows {
        add_show(&mut writer, fields, s, tr_shows.get(&s.id));
    }
    writer.commit()?;
    let reader = index
        .reader_builder()
        .reload_policy(ReloadPolicy::OnCommitWithDelay)
        .try_into()?;
    reader.reload()?;
    Ok(Active { reader, _index: index })
}

fn add_item(writer: &mut IndexWriter, f: &Fields, item: &MediaItem, kind: &str, tr: Option<&Vec<TransData>>) {
    let mut doc = TantivyDocument::new();
    doc.add_text(f.id, &item.id);
    doc.add_text(f.kind, kind);
    doc.add_text(f.title, &item.title);
    if let Some(t) = &item.episode_title {
        doc.add_text(f.title, t);
    }
    if let Some(st) = &item.show_title {
        doc.add_text(f.show_title, st);
    }
    if let Some(sid) = &item.show_id {
        doc.add_text(f.show_id, sid);
    }
    add_meta(&mut doc, f, &item.title, item.metadata.as_ref());
    add_translations(&mut doc, f, &item.title, tr);
    let _ = writer.add_document(doc);
}

fn add_show(writer: &mut IndexWriter, f: &Fields, show: &Show, tr: Option<&Vec<TransData>>) {
    let mut doc = TantivyDocument::new();
    doc.add_text(f.id, &show.id);
    doc.add_text(f.kind, "show");
    doc.add_text(f.title, &show.title);
    add_meta(&mut doc, f, &show.title, show.metadata.as_ref());
    add_translations(&mut doc, f, &show.title, tr);
    let _ = writer.add_document(doc);
}

fn add_translations(doc: &mut TantivyDocument, f: &Fields, file_title: &str, tr: Option<&Vec<TransData>>) {
    let Some(list) = tr else { return };
    for t in list {
        if let Some(title) = &t.title {
            if !title.eq_ignore_ascii_case(file_title) {
                doc.add_text(f.alt_title, title);
            }
        }
        if let Some(o) = &t.overview {
            doc.add_text(f.overview, o);
        }
        for g in &t.genres {
            doc.add_text(f.genres, g);
        }
    }
}

fn add_meta(doc: &mut TantivyDocument, f: &Fields, file_title: &str, meta: Option<&Metadata>) {
    let Some(meta) = meta else { return };
    if let Some(t) = &meta.title {
        if !t.eq_ignore_ascii_case(file_title) {
            doc.add_text(f.alt_title, t);
        }
    }
    if let Some(o) = &meta.overview {
        doc.add_text(f.overview, o);
    }
    for g in &meta.genres {
        doc.add_text(f.genres, g);
    }
    for c in &meta.cast {
        doc.add_text(f.cast, &c.name);
    }
}

// Uses the index's own analyzer so query terms fold identically to indexed ones.
fn normalize(index: &Index, raw: &str) -> Vec<String> {
    let Some(mut analyzer) = index.tokenizers().get(ANALYZER) else {
        return raw.split_whitespace().map(str::to_lowercase).collect();
    };
    let mut stream = analyzer.token_stream(raw);
    let mut tokens = Vec::new();
    while stream.advance() {
        tokens.push(stream.token().text.clone());
    }
    tokens
}

fn field_str(doc: &TantivyDocument, field: Field) -> String {
    doc.get_first(field)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

/// Never blocks the caller; a failure is logged and the prior index is kept.
pub fn spawn_reindex(state: SharedState) {
    std::thread::spawn(move || match state.search.reindex_from_db(&state.db) {
        Ok(()) => info!("search index rebuilt"),
        Err(e) => warn!(error = %e, "search reindex failed"),
    });
}

#[cfg(test)]
mod tests;
