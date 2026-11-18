//! What is trending in the world this week, as the metadata provider ranks it.
//!
//! A household's own plays say what is trending at home, and a household of one
//! has none worth the name: its "trending" would be the viewer's own history.
//! The provider's ranking is the heat a small server cannot make for itself. It
//! only ever orders titles the library already holds. Its artwork is all a
//! screen has to show before a library exists: a sign-in, the guided setup.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread::JoinHandle;

use crate::infra::metadata::discover::{self, DiscoverHit, DiscoverPage, DiscoverScope};
use crate::model::{RequestKind, SplashEntry};
use crate::services::jobs::now_ms;
use crate::state::SharedState;

/// One ranked title: whether it is a show, and the provider's id for it.
pub type Ranked = (bool, u64);

const FRESH_FOR_MS: i64 = 12 * 3_600_000;
const RETRY_AFTER_MS: i64 = 30 * 60_000;
const PAGES: u32 = 5;
const ANY_LANGUAGE: &str = "en-US";
const COVERS: usize = 48;

/// What the provider's ranking gives: the order, and the artwork of the titles
/// leading it.
#[derive(Clone, Default)]
struct World {
    ranked: Arc<Vec<Ranked>>,
    covers: Arc<Vec<SplashEntry>>,
}

#[derive(Default)]
pub struct WorldTrending {
    held: Mutex<Option<(i64, World)>>,
    fetching: AtomicBool,
}

impl WorldTrending {
    /// The ranking in hand, the most trending first. Never waits on the
    /// provider: when what is held has gone stale it is answered as it is and
    /// read again in the background, so the next home has the fresh one. Empty
    /// until the first answer, and for a server with no provider key.
    pub fn ranked(&self, state: &SharedState) -> Arc<Vec<Ranked>> {
        self.world(state).ranked
    }

    /// The artwork of the titles leading the ranking, for a screen that has no
    /// library to draw from yet. Read with the ranking and as fresh as it is.
    pub fn covers(&self, state: &SharedState) -> Arc<Vec<SplashEntry>> {
        self.world(state).covers
    }

    fn world(&self, state: &SharedState) -> World {
        let now = now_ms();
        let held = self.held.lock().unwrap_or_else(PoisonError::into_inner).clone();
        let (due, world) = match held {
            Some((until, world)) => (now >= until, world),
            None => (true, World::default()),
        };
        if due {
            self.refresh(state);
        }
        world
    }

    fn refresh(&self, state: &SharedState) -> Option<JoinHandle<()>> {
        let key = state.config.tmdb_api_key.clone()?;
        if self.fetching.swap(true, Ordering::AcqRel) {
            return None;
        }
        let state = state.clone();
        Some(std::thread::spawn(move || {
            state.home.world.settle(fetch(&key), now_ms());
        }))
    }

    fn settle(&self, fetched: Option<World>, now: i64) {
        let mut held = self.held.lock().unwrap_or_else(PoisonError::into_inner);
        let previous = held.take().map(|(_, world)| world).unwrap_or_default();
        *held = Some(match fetched {
            Some(read) => (now + FRESH_FOR_MS, read),
            None => (now + RETRY_AFTER_MS, previous),
        });
        self.fetching.store(false, Ordering::Release);
    }

    #[cfg(test)]
    pub(crate) fn hold(&self, ranked: Vec<Ranked>) {
        self.hold_world(ranked, Vec::new());
    }

    #[cfg(test)]
    pub(crate) fn hold_world(&self, ranked: Vec<Ranked>, covers: Vec<SplashEntry>) {
        let world = World {
            ranked: Arc::new(ranked),
            covers: Arc::new(covers),
        };
        *self.held.lock().unwrap() = Some((i64::MAX, world));
    }
}

/// The library's own sample of artwork, filled up to `cap` with the titles
/// the world watches this week. A library that fills the sample alone keeps
/// it whole.
pub fn with_world(state: &SharedState, mut held: Vec<SplashEntry>, cap: usize) -> Vec<SplashEntry> {
    if held.len() >= cap {
        return held;
    }
    let world = state.home.world.covers(state);
    let missing = cap - held.len();
    held.extend(world.iter().take(missing).cloned());
    held
}

fn fetch(key: &str) -> Option<World> {
    let films = fetch_scope(key, DiscoverScope::Movies);
    let shows = fetch_scope(key, DiscoverScope::Shows);
    world_of(films, shows)
}

fn world_of(films: Vec<DiscoverHit>, shows: Vec<DiscoverHit>) -> Option<World> {
    let hits = interleave(films, shows);
    if hits.is_empty() {
        return None;
    }
    let ranked = hits
        .iter()
        .map(|hit| (hit.kind == RequestKind::Show, hit.tmdb_id))
        .collect();
    let covers = hits.into_iter().filter_map(cover).take(COVERS).collect();
    Some(World {
        ranked: Arc::new(ranked),
        covers: Arc::new(covers),
    })
}

fn cover(hit: DiscoverHit) -> Option<SplashEntry> {
    let kind = if hit.kind == RequestKind::Show { "show" } else { "movie" };
    Some(SplashEntry {
        kind: kind.to_string(),
        title: hit.title,
        year: hit.year,
        backdrop_url: hit.backdrop_url?,
        poster_url: hit.poster_url,
        rating: hit.rating.map(f64::from),
        trending: true,
    })
}

fn fetch_scope(key: &str, scope: DiscoverScope) -> Vec<DiscoverHit> {
    read_pages(|page| discover::trending(key, ANY_LANGUAGE, scope, page))
}

fn read_pages(mut read: impl FnMut(u32) -> Result<DiscoverPage, ()>) -> Vec<DiscoverHit> {
    let mut hits: Vec<DiscoverHit> = Vec::new();
    for page in 1..=PAGES {
        let Ok(found) = read(page) else {
            tracing::warn!(target: "sections", page, "reading the provider's trending list failed");
            break;
        };
        let last = page >= found.total_pages;
        hits.extend(found.hits);
        if last {
            break;
        }
    }
    hits
}

fn interleave<T>(films: Vec<T>, shows: Vec<T>) -> Vec<T> {
    let mut ranked = Vec::with_capacity(films.len() + shows.len());
    let (mut films, mut shows) = (films.into_iter(), shows.into_iter());
    loop {
        let (film, show) = (films.next(), shows.next());
        if film.is_none() && show.is_none() {
            return ranked;
        }
        ranked.extend(film);
        ranked.extend(show);
    }
}

/// The top `cap` of a trending row. A household of several leads with what it
/// played itself, and the world's ranking fills what is left; a household of
/// one is given the world's ranking alone.
pub fn blend(household: Vec<String>, viewers: usize, world: &[String], cap: usize) -> Vec<String> {
    let mut row = if viewers > 1 { household } else { Vec::new() };
    row.truncate(cap);
    for id in world {
        if row.len() >= cap {
            break;
        }
        if !row.contains(id) {
            row.push(id.clone());
        }
    }
    row
}

#[cfg(test)]
mod tests;
