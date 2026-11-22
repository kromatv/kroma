//! The provider's trending lists the discover pages walk through: each one read
//! deep in a single pass, so its pages share one ranking, and held for an hour.

mod read;
#[cfg(test)]
mod tests;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread::JoinHandle;

use crate::infra::metadata::discover::{self, DiscoverHit, DiscoverPage, DiscoverScope};
use crate::services::jobs::now_ms;

/// How many titles one page of a trending list holds.
pub const PAGE_SIZE: usize = 60;

/// Where a trending list is read from, and which one it is.
#[derive(Debug, Clone)]
pub struct Source {
    pub key: String,
    pub language: String,
    pub scope: DiscoverScope,
}

impl Source {
    fn read(&self, now_ms: i64) -> anyhow::Result<Held> {
        let page = |number| discover::trending(&self.key, &self.language, self.scope, number);
        read::list(&page, now_ms)
    }
}

#[derive(Default)]
pub struct TrendingLists {
    lists: Mutex<Vec<(DiscoverScope, String, Arc<List>)>>,
}

impl TrendingLists {
    /// One page of `source`'s list, clamped into the pages the list has. Only
    /// the first read of a list waits on the provider, and fails when the
    /// provider cannot give its first page. A list older than an hour is
    /// answered as it is and read again in the background.
    pub fn page(&self, source: &Source, page: u32) -> anyhow::Result<DiscoverPage> {
        let hits = self.list(source).hits(source)?;
        Ok(slice(&hits, page))
    }

    /// Read the films and the shows lists in `language` in the background, each
    /// one that nothing is held for and nobody is reading, so the first page
    /// asked of them does not wait on the provider. Never blocks. Returns the
    /// reads it started.
    pub fn warm(&self, key: &str, language: &str) -> Vec<JoinHandle<()>> {
        [DiscoverScope::Movies, DiscoverScope::Shows]
            .into_iter()
            .filter_map(|scope| {
                self.warm_list(Source {
                    key: key.to_owned(),
                    language: language.to_owned(),
                    scope,
                })
            })
            .collect()
    }

    fn warm_list(&self, source: Source) -> Option<JoinHandle<()>> {
        let list = self.list(&source);
        let cold = list.held.try_lock().is_ok_and(|held| held.is_none());
        cold.then(|| {
            std::thread::spawn(move || {
                let _ = list.hits(&source);
            })
        })
    }

    fn list(&self, source: &Source) -> Arc<List> {
        let mut lists = lock(&self.lists);
        let known = lists
            .iter()
            .find(|(scope, language, _)| *scope == source.scope && *language == source.language);
        if let Some((.., list)) = known {
            return Arc::clone(list);
        }
        let list = Arc::<List>::default();
        lists.push((source.scope, source.language.clone(), Arc::clone(&list)));
        list
    }
}

#[derive(Default)]
struct List {
    held: Mutex<Option<Held>>,
    reading: AtomicBool,
}

#[derive(Clone)]
struct Held {
    hits: Arc<Vec<DiscoverHit>>,
    until_ms: i64,
}

impl List {
    fn hits(self: &Arc<Self>, source: &Source) -> anyhow::Result<Arc<Vec<DiscoverHit>>> {
        let mut held = lock(&self.held);
        let Some(Held { hits, until_ms }) = held.clone() else {
            let read = source.read(now_ms())?;
            let hits = Arc::clone(&read.hits);
            *held = Some(read);
            return Ok(hits);
        };
        drop(held);
        if now_ms() >= until_ms {
            self.read_again(source.clone());
        }
        Ok(hits)
    }

    fn read_again(self: &Arc<Self>, source: Source) -> Option<JoinHandle<()>> {
        if self.reading.swap(true, Ordering::AcqRel) {
            return None;
        }
        let list = Arc::clone(self);
        Some(std::thread::spawn(move || {
            let now = now_ms();
            list.settle(source.read(now), now);
            list.reading.store(false, Ordering::Release);
        }))
    }

    fn settle(&self, read: anyhow::Result<Held>, now_ms: i64) {
        let mut held = lock(&self.held);
        if let Ok(read) = read {
            *held = Some(read);
        } else if let Some(stale) = held.as_mut() {
            stale.until_ms = now_ms + read::RETRY_AFTER_MS;
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn slice(hits: &[DiscoverHit], page: u32) -> DiscoverPage {
    let total_pages = hits.chunks(PAGE_SIZE).len().max(1);
    let at = (page as usize).clamp(1, total_pages);
    DiscoverPage {
        hits: hits
            .chunks(PAGE_SIZE)
            .nth(at - 1)
            .map(<[_]>::to_vec)
            .unwrap_or_default(),
        page: at as u32,
        total_pages: total_pages as u32,
    }
}
