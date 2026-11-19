//! The batches a walk hands over while it still runs, so a title can reach the
//! catalogue before the last folder is read.

use std::collections::HashSet;
use std::time::{Duration, Instant};

use crate::db::ScanBatch;
use crate::model::{Library, MediaItem, Show};

use super::found::Found;
use super::index::Indexed;

/// When a walk closes a batch: at `files` files found, or once `every` has
/// passed since the last one, whichever comes first, and at the end of each
/// library. [`BatchSize::LIVE`] keeps one write short and still shows a slow
/// share's titles arriving.
#[derive(Clone, Copy, Debug)]
pub(super) struct BatchSize {
    pub files: usize,
    pub every: Duration,
}

impl BatchSize {
    pub(super) const LIVE: Self = Self {
        files: 500,
        every: Duration::from_secs(2),
    };
}

pub(super) type BatchSink<'a, S> = dyn FnMut(&ScanBatch<'_>) -> Result<(), S> + 'a;

pub(super) struct Batches<'s, S> {
    sink: &'s mut BatchSink<'s, S>,
    size: BatchSize,
    items: HashSet<String>,
    shows: HashSet<String>,
    files: usize,
    opened: Instant,
}

impl<'s, S> Batches<'s, S> {
    pub(super) fn new(size: BatchSize, sink: &'s mut BatchSink<'s, S>) -> Self {
        Self {
            sink,
            size,
            items: HashSet::new(),
            shows: HashSet::new(),
            files: 0,
            opened: Instant::now(),
        }
    }

    pub(super) fn note(&mut self, indexed: Indexed) {
        self.items.insert(indexed.item);
        self.shows.extend(indexed.show);
        self.files += 1;
    }

    pub(super) fn due(&self) -> bool {
        self.files > 0
            && (self.files >= self.size.files || self.opened.elapsed() >= self.size.every)
    }

    pub(super) fn close(&mut self, library: &Library, found: &Found) -> Result<(), S> {
        if self.files == 0 {
            return Ok(());
        }
        let shows: Vec<&Show> = self
            .shows
            .iter()
            .filter_map(|id| found.shows.get(id))
            .collect();
        let items: Vec<&MediaItem> = self
            .items
            .iter()
            .filter_map(|id| found.items.get(id))
            .collect();
        (self.sink)(&ScanBatch {
            library,
            shows: &shows,
            items: &items,
            mtimes: &found.mtimes,
        })?;
        self.items.clear();
        self.shows.clear();
        self.files = 0;
        self.opened = Instant::now();
        Ok(())
    }
}
