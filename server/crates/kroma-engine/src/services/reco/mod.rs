//! The recommender: every title as a set of features, one viewer's taste read
//! off what they watched, and the ranking that puts the two together. Nothing
//! here needs a module: an embedder sharpens the ranking when one answers and
//! is not missed when none does.

pub mod catalog;
pub mod genre;
pub mod rank;
pub mod taste;

use std::collections::HashMap;
use std::sync::{Arc, Mutex, PoisonError};

use crate::db::{self, Pool};
use crate::state::SharedState;

pub use catalog::{Catalog, Feature, Title};
pub use rank::{Scored, Signals};
pub use taste::Taste;

/// The catalogue as features, rebuilt when the catalogue changes: it depends
/// on no viewer, so every home shares it.
#[derive(Default)]
pub struct CatalogMemo {
    held: Mutex<Option<(Stamp, Arc<Catalog>)>>,
}

type Stamp = (u64, (usize, usize, usize));

impl CatalogMemo {
    pub fn get(&self, state: &SharedState, pool: &Pool) -> Arc<Catalog> {
        let version = (
            state.events.catalog_version(),
            db::counts(pool).unwrap_or_default(),
        );
        let mut held = self.held.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some((at, catalog)) = held.as_ref() {
            if *at == version {
                return catalog.clone();
            }
        }
        let facts = db::title_facts(pool).unwrap_or_else(|e| {
            tracing::error!(target: "reco", "reading the catalogue failed: {e:#}");
            Vec::new()
        });
        let catalog = Arc::new(Catalog::build(facts));
        *held = Some((version, catalog.clone()));
        catalog
    }
}

/// One viewer, ready to be ranked for.
pub struct Viewer {
    pub user_id: String,
    pub taste: Taste,
    pub history: HashMap<String, db::Engagement>,
    pub social: HashMap<String, f32>,
    /// How many accounts of the household have played anything.
    pub household: usize,
    /// The library's titles the world is watching this week, the most watched first.
    pub world: Vec<String>,
    pub vectors: HashMap<String, f32>,
    pub salt: u64,
    pub now: i64,
}

const VECTOR_SEEDS: usize = 5;
const TREND_DEPTH: usize = 50;
const TREND_SHARE: f32 = 0.7;
const WORLD_SHARE: f32 = 0.5;
const DAY: i64 = 86_400;

impl Viewer {
    pub fn read(state: &SharedState, pool: &Pool, catalog: &Catalog, user_id: &str, now: i64) -> Self {
        let played = crate::services::settings::played_percent(&state.settings);
        let history = db::engagements(pool, user_id, played).unwrap_or_else(|e| {
            tracing::warn!(target: "reco", "reading a viewer's history failed: {e:#}");
            HashMap::new()
        });
        let taste = Taste::read(catalog, &history, now);
        let seeds: Vec<String> = taste
            .liked
            .iter()
            .take(VECTOR_SEEDS)
            .map(|(id, _)| id.clone())
            .collect();
        let vectors = state.vectors.nearest_to_any(&seeds);
        let plays = db::household_plays(pool).unwrap_or_default();
        let household = plays
            .iter()
            .map(|(user, _)| user.as_str())
            .collect::<std::collections::HashSet<_>>()
            .len();
        let world: Vec<String> = state
            .home
            .world
            .ranked(state)
            .iter()
            .filter_map(|(show, tmdb)| catalog.by_provider(*show, *tmdb))
            .map(|title| title.facts.id.clone())
            .collect();
        let mut social = rank::cowatched(&plays, user_id);
        let reach = world.len() as f32;
        for (place, id) in world.iter().enumerate() {
            let score = WORLD_SHARE * (reach - place as f32) / reach;
            let entry = social.entry(id.clone()).or_default();
            *entry = entry.max(score);
        }
        let trending = db::trending_ids(pool, TREND_DEPTH).unwrap_or_default();
        let depth = trending.len() as f32;
        for (place, id) in trending.into_iter().enumerate() {
            let score = TREND_SHARE * (depth - place as f32) / depth;
            let entry = social.entry(id).or_default();
            *entry = entry.max(score);
        }
        Self {
            user_id: user_id.to_string(),
            taste,
            history,
            social,
            household,
            world,
            vectors,
            salt: rank::salt(user_id, now.div_euclid(DAY)),
            now,
        }
    }

    pub fn signals(&self) -> Signals<'_> {
        Signals {
            taste: &self.taste,
            vectors: &self.vectors,
            social: &self.social,
            now: self.now,
            salt: self.salt,
        }
    }
}
