use std::cmp::Reverse;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use tantivy::collector::TopDocs;
use tantivy::columnar::Column;
use tantivy::query::Query;
use tantivy::{DocId, Score, Searcher, SegmentReader};

use super::entry::Entry;
use super::hit::{collapse_episodes, Hit, Ranked, CANDIDATE_FACTOR, MAX_CANDIDATES};
use super::index::Active;
use super::parse::Parsed;
use super::query::{self, Need};
use super::rerank::Intent;
use super::schema::{Fields, ORD};

pub(super) fn ord_of(ords: Option<&Column<u64>>, doc: DocId) -> Option<usize> {
    Some(ords?.first(doc)? as usize)
}

pub(super) struct Run<'a> {
    pub(super) fields: &'a Fields,
    pub(super) active: Arc<Active>,
    pub(super) searcher: Searcher,
    pub(super) visible: Arc<HashSet<String>>,
    pub(super) titles: Option<Arc<HashSet<String>>>,
    pub(super) favoured: Arc<HashMap<String, f32>>,
    pub(super) limit: usize,
}

const UNSEEN: f32 = -1.0;

impl Run<'_> {
    pub(super) fn titles(&self, parsed: &Parsed, need: Need) -> Vec<Hit> {
        let common: Vec<bool> = parsed
            .tokens
            .iter()
            .map(|token| query::is_common(&self.searcher, self.fields, &token.text))
            .collect();
        let Some(query) = query::build(self.fields, parsed, &common, need) else {
            return Vec::new();
        };
        let meaningful: Vec<bool> = common.iter().map(|common| !common).collect();
        let intent = Arc::new(Intent::of(parsed, &meaningful));
        let candidates = self
            .limit
            .saturating_mul(CANDIDATE_FACTOR)
            .min(MAX_CANDIDATES)
            .max(self.limit);
        let ranked = self
            .weighed(&*query, &intent, candidates)
            .into_iter()
            .filter_map(|ord| {
                let entry = self.active.entries.get(ord)?;
                Some(Ranked {
                    hit: Hit {
                        id: entry.id.clone(),
                        kind: entry.kind,
                        show_id: entry.show_id.clone(),
                    },
                    located: intent.located(entry),
                })
            })
            .collect();
        collapse_episodes(ranked, self.limit)
    }

    fn weighed(&self, query: &dyn Query, intent: &Arc<Intent>, limit: usize) -> Vec<usize> {
        let (active, shelf, favoured, intent) = (
            self.active.clone(),
            Shelf::of(self),
            self.favoured.clone(),
            intent.clone(),
        );
        let by_weight = TopDocs::with_limit(limit).tweak_score(move |segment: &SegmentReader| {
            let ords = segment.fast_fields().u64(ORD).ok();
            let (active, shelf, favoured, intent) = (
                active.clone(),
                shelf.clone(),
                favoured.clone(),
                intent.clone(),
            );
            move |doc: DocId, score: Score| {
                let Some(ord) = ord_of(ords.as_ref(), doc) else {
                    return (UNSEEN, Reverse(0));
                };
                let weighed = active
                    .entries
                    .get(ord)
                    .filter(|entry| shelf.holds(entry))
                    .map_or(UNSEEN, |entry| {
                        score * intent.weigh(entry, favour(&favoured, entry))
                    });
                (weighed, Reverse(ord))
            }
        });
        self.searcher
            .search(query, &by_weight)
            .unwrap_or_default()
            .into_iter()
            .filter(|((score, _), _)| *score > UNSEEN)
            .map(|((_, Reverse(ord)), _)| ord)
            .collect()
    }
}

#[derive(Clone)]
struct Shelf {
    libraries: Arc<HashSet<String>>,
    titles: Option<Arc<HashSet<String>>>,
}

impl Shelf {
    fn of(run: &Run) -> Shelf {
        Shelf {
            libraries: run.visible.clone(),
            titles: run.titles.clone(),
        }
    }

    fn holds(&self, entry: &Entry) -> bool {
        let title = entry.show_id.as_ref().unwrap_or(&entry.id);
        self.libraries.contains(&entry.library)
            && self.titles.as_ref().is_none_or(|ids| ids.contains(title))
    }
}

fn favour(favoured: &HashMap<String, f32>, entry: &Entry) -> f32 {
    favoured
        .get(&entry.id)
        .or_else(|| entry.show_id.as_ref().and_then(|show| favoured.get(show)))
        .copied()
        .unwrap_or(1.0)
}
