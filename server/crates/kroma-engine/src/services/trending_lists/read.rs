use std::collections::HashSet;
use std::iter;
use std::ops::RangeInclusive;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, PoisonError};

use anyhow::anyhow;

use crate::infra::metadata::discover::{DiscoverHit, DiscoverPage};

use super::{lock, Held};

// The provider claims 500 pages, but past the first few hundred titles they are
// ones nobody has rated and that have no summary in the reader's language.
pub(super) const DEPTH: u32 = 25;
const IN_FLIGHT: usize = 8;
const FRESH_FOR_MS: i64 = 3_600_000;
pub(super) const RETRY_AFTER_MS: i64 = 5 * 60_000;

pub(super) fn list<R>(page: &R, now_ms: i64) -> anyhow::Result<Held>
where
    R: Fn(u32) -> Result<DiscoverPage, ()> + Sync,
{
    let first = page(1).map_err(|()| anyhow!("TMDB trending failed"))?;
    let rest = pages(page, 2..=first.total_pages.clamp(1, DEPTH));
    let whole = rest.iter().all(Option::is_some);
    let read = iter::once(first).chain(rest.into_iter().map_while(|page| page));
    let fresh_for = if whole { FRESH_FOR_MS } else { RETRY_AFTER_MS };
    Ok(Held {
        hits: Arc::new(rank(read)),
        until_ms: now_ms + fresh_for,
    })
}

fn pages<R>(page: &R, numbers: RangeInclusive<u32>) -> Vec<Option<DiscoverPage>>
where
    R: Fn(u32) -> Result<DiscoverPage, ()> + Sync,
{
    let numbers: Vec<u32> = numbers.collect();
    let read = Mutex::new(vec![None; numbers.len()]);
    let next = AtomicUsize::new(0);
    std::thread::scope(|scope| {
        for _ in 0..IN_FLIGHT.min(numbers.len()) {
            scope.spawn(|| loop {
                let at = next.fetch_add(1, Ordering::Relaxed);
                let Some(&number) = numbers.get(at) else {
                    return;
                };
                let answer = page(number).ok();
                lock(&read)[at] = answer;
            });
        }
    });
    read.into_inner().unwrap_or_else(PoisonError::into_inner)
}

pub(super) fn rank(pages: impl IntoIterator<Item = DiscoverPage>) -> Vec<DiscoverHit> {
    let mut placed = HashSet::new();
    pages
        .into_iter()
        .flat_map(|page| page.hits)
        .filter(|hit| hit.poster_url.is_some() && placed.insert((hit.kind, hit.tmdb_id)))
        .collect()
}
