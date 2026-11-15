use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use anyhow::Result;
use tantivy::collector::TopDocs;
use tantivy::schema::Schema;
use tantivy::{DocId, Score, SegmentReader};
use tracing::{info, warn};

use super::hit::{Hit, HitKind};
use super::index::{build_active, normalize, Active, Catalog};
use super::lexicon::Lexicon;
use super::parse;
use super::people::{self, PersonHit};
use super::query::{self, Need};
use super::run::{ord_of, Run};
use super::schema::{self, Fields, ORD};
use crate::db::{self, Pool};
use crate::model::{Kind, MediaItem, Show};
use crate::state::SharedState;

pub struct SearchEngine {
    schema: Schema,
    fields: Fields,
    active: RwLock<Arc<Active>>,
    rebuilding: Mutex<()>,
}

/// Who is asking, as far as ranking goes.
pub struct Asker<'a> {
    /// Whether a library is one the asker may see.
    pub visible: &'a dyn Fn(&str) -> bool,
    /// Titles to favour by id, as a factor above 1.0: what the asker is in the
    /// middle of, or saved. A show's factor reaches its episodes.
    pub favoured: &'a HashMap<String, f32>,
}

/// What a query found.
#[derive(Debug, Default, PartialEq)]
pub struct Answer {
    pub hits: Vec<Hit>,
    pub people: Vec<PersonHit>,
}

const MIN_WORDS_TO_RELAX: usize = 2;
const RELAXED_SHARE: f32 = 0.5;

impl SearchEngine {
    /// Searches return nothing until the first rebuild.
    pub fn new() -> Result<Self> {
        let (schema, fields) = schema::build();
        let active = build_active(schema.clone(), &fields, &empty_catalog())?;
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
        let catalog = Catalog {
            movies,
            shows,
            episodes,
            tr_movies: &empty,
            tr_episodes: &empty,
            tr_shows: &empty,
        };
        let active = build_active(self.schema.clone(), &self.fields, &catalog)?;
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
        let tr_episodes = db::translations::all_for_kind(pool, "episode").unwrap_or_default();
        let tr_shows =
            db::translations::all_for_kind(pool, db::metadata_core::SHOW).unwrap_or_default();
        let catalog = Catalog {
            movies: &movies,
            shows: &shows,
            episodes: &episodes,
            tr_movies: &tr_movies,
            tr_episodes: &tr_episodes,
            tr_shows: &tr_shows,
        };
        let active = build_active(self.schema.clone(), &self.fields, &catalog)?;
        *self.active.write().unwrap() = Arc::new(active);
        Ok(())
    }

    /// Top-`limit` hits for `raw`, best first, for somebody who sees every
    /// library. Empty for a blank query.
    pub fn search(&self, raw: &str, limit: usize) -> Vec<Hit> {
        let asker = Asker {
            visible: &|_| true,
            favoured: &HashMap::new(),
        };
        self.answer(raw, limit, &asker).hits
    }

    /// The titles and the people `raw` finds for `asker`, best first.
    ///
    /// A query is first read for what it asks beyond its words (a year, a kind,
    /// an episode number). When that reading finds nothing it is read word for
    /// word, then as one word, then for most of its words.
    pub fn answer(&self, raw: &str, limit: usize, asker: &Asker) -> Answer {
        let active = self.active.read().unwrap().clone();
        let words = normalize(&active._index, raw);
        if words.is_empty() {
            return Answer::default();
        }
        let run = Run {
            fields: &self.fields,
            searcher: active.reader.searcher(),
            visible: Arc::new(
                active
                    .libraries
                    .iter()
                    .filter(|library| (asker.visible)(library))
                    .cloned()
                    .collect(),
            ),
            favoured: Arc::new(asker.favoured.clone()),
            active: active.clone(),
            limit: limit.max(1),
        };
        let read = parse::parse(&words, Lexicon::shared());
        let literal = parse::literal(&words);
        let mut hits = run.titles(&read, Need::All);
        if hits.is_empty() && read != literal {
            hits = run.titles(&literal, Need::All);
        }
        if hits.is_empty() && words.len() >= MIN_WORDS_TO_RELAX {
            hits = run.titles(&parse::literal(&[words.concat()]), Need::All);
        }
        if hits.is_empty() && words.len() > MIN_WORDS_TO_RELAX {
            let most = (words.len() as f32 * RELAXED_SHARE).ceil() as usize;
            hits = run.titles(&literal, Need::AtLeast(most));
        }
        let people = people::matching(&active.people, &read.text_words(), asker.visible);
        Answer { hits, people }
    }

    /// How strongly each movie and show carries one of `phrases` in a title or
    /// a synopsis, in any stored language: 1.0 for a title, less for a synopsis.
    /// A title that carries none is absent.
    pub fn carrying(&self, phrases: &[&str]) -> HashMap<String, f32> {
        let active = self.active.read().unwrap().clone();
        let phrases: Vec<Vec<String>> = phrases
            .iter()
            .map(|phrase| normalize(&active._index, phrase))
            .collect();
        let Some(query) = query::carrying(&self.fields, &phrases) else {
            return HashMap::new();
        };
        let searcher = active.reader.searcher();
        let all = active.entries.len().max(1);
        let by_score = TopDocs::with_limit(all).tweak_score(|segment: &SegmentReader| {
            let ords = segment.fast_fields().u64(ORD).ok();
            move |doc: DocId, score: Score| (score, ord_of(ords.as_ref(), doc))
        });
        searcher
            .search(&*query, &by_score)
            .unwrap_or_default()
            .into_iter()
            .filter_map(|((score, ord), _)| {
                let entry = active.entries.get(ord?)?;
                (entry.kind != HitKind::Episode).then(|| (entry.id.clone(), score.min(1.0)))
            })
            .collect()
    }
}

fn empty_catalog() -> Catalog<'static> {
    static NONE: std::sync::OnceLock<HashMap<String, Vec<db::translations::TransData>>> =
        std::sync::OnceLock::new();
    let none = NONE.get_or_init(HashMap::new);
    Catalog {
        movies: &[],
        shows: &[],
        episodes: &[],
        tr_movies: none,
        tr_episodes: none,
        tr_shows: none,
    }
}

/// Never blocks the caller; a failure is logged and the prior index is kept.
pub fn spawn_reindex(state: SharedState) {
    std::thread::spawn(move || match state.search.reindex_from_db(&state.db) {
        Ok(()) => info!("search index rebuilt"),
        Err(e) => warn!(error = %e, "search reindex failed"),
    });
}
