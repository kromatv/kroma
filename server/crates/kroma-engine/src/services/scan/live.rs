//! A walk written into the catalogue while it still runs: each batch is a
//! transaction of its own, and only a walk that read every folder prunes.

use std::collections::HashSet;
use std::ops::ControlFlow;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use tracing::warn;

use crate::db::{self, Pool, ScanBatch};
use crate::infra::events::{Bus, ServerEvent};
use crate::services::settings::LibraryDef;

use super::batches::BatchSize;
use super::changed_shows::HeldEpisodes;
use super::{scan_in_batches, ScanData, Unread, UnreadLibrary};

const ANNOUNCE_EVERY: Duration = Duration::from_secs(2);

static WALK_TURN: Mutex<()> = Mutex::new(());

/// The turn a pass over the libraries holds from before it reads the
/// configuration until it has pruned. One pass runs at a time, whatever starts
/// it: a second one waits in [`WalkTurn::wait`] for the first to end, so
/// neither removes what the other wrote. Read the library definitions AFTER
/// the wait: a pass that waited walks what is configured when its turn comes.
pub struct WalkTurn {
    _held: MutexGuard<'static, ()>,
}

impl WalkTurn {
    pub fn wait() -> Self {
        Self {
            _held: WALK_TURN.lock().unwrap_or_else(PoisonError::into_inner),
        }
    }
}

/// How a walk that writes as it goes ended. `Synced`: every folder was read,
/// and what the walk did not find is pruned. `Empty`: every folder was read and
/// none held a title, which is an outage: no title was written and none was
/// pruned. `Stopped`: it ended before the last folder, so what its batches
/// wrote stays and nothing was pruned. `dropped` counts the libraries that had
/// left the configuration and went before the walk.
pub enum Walked {
    Synced(ScanData),
    Empty { unreadable: usize, dropped: usize },
    Stopped { dropped: usize },
}

/// Hears how many rows each batch wrote, once the batch is in the catalogue,
/// and before them how many libraries the walk removed at its start, when it
/// removed any. `Break` stops the walk there.
pub type AfterBatch<'a> = dyn FnMut(usize) -> ControlFlow<()> + 'a;

/// An [`AfterBatch`] for a walk nothing can stop and nobody is listening to.
pub fn uninterrupted(_rows: usize) -> ControlFlow<()> {
    ControlFlow::Continue(())
}

/// Walk `defs` and write what the walk finds batch by batch, so a title is in
/// the catalogue before the last folder is read. A library `defs` no longer
/// names is removed first: that is the owner's change, not a finding. Removing
/// a file that is gone waits for the whole walk: a walk that stops, or finds
/// nothing at all, prunes nothing.
pub fn sync_walk(
    turn: &WalkTurn,
    db: &Pool,
    defs: &[LibraryDef],
    after_batch: &mut AfterBatch<'_>,
) -> anyhow::Result<Walked> {
    sync_walk_in(turn, db, defs, BatchSize::LIVE, after_batch)
}

enum Halt {
    Stopped,
    Failed(anyhow::Error),
}

pub(super) fn sync_walk_in(
    _turn: &WalkTurn,
    db: &Pool,
    defs: &[LibraryDef],
    size: BatchSize,
    after_batch: &mut AfterBatch<'_>,
) -> anyhow::Result<Walked> {
    let configured: Vec<&str> = defs.iter().map(|def| def.id.as_str()).collect();
    let dropped = db::drop_unconfigured_libraries(db, &configured)?;
    if dropped > 0 && after_batch(dropped).is_break() {
        return Ok(Walked::Stopped { dropped });
    }
    let held = HeldEpisodes::read(db);
    let mut write = |batch: &ScanBatch<'_>| {
        let rows = db::sync_batch(db, batch).map_err(Halt::Failed)?;
        match after_batch(rows) {
            ControlFlow::Continue(()) => Ok(()),
            ControlFlow::Break(()) => Err(Halt::Stopped),
        }
    };
    let mut data = match scan_in_batches(defs, size, &mut write) {
        Ok(data) => data,
        Err(Halt::Stopped) => return Ok(Walked::Stopped { dropped }),
        Err(Halt::Failed(error)) => return Err(after_removing(dropped, error)),
    };
    if data.items.is_empty() {
        return Ok(Walked::Empty {
            unreadable: data.unreadable,
            dropped,
        });
    }
    held.note_changed(&mut data);
    finish(db, &held, &data).map_err(|error| after_removing(dropped, error))?;
    Ok(Walked::Synced(data))
}

fn finish(db: &Pool, held: &HeldEpisodes, data: &ScanData) -> anyhow::Result<()> {
    let unread: HashSet<String> = data
        .unread_libraries
        .iter()
        .map(|library| library.id.clone())
        .collect();
    let walk = db::WalkEnd {
        libraries: &data.libraries,
        items: &data.items,
        unread: &unread,
        settled: &held.settled_by(data),
    };
    db::finish_sync(db, &walk)?;
    warn_kept(&data.unread_libraries);
    Ok(())
}

fn warn_kept(unread: &[UnreadLibrary]) {
    for library in unread {
        let name = library.name.as_str();
        match &library.why {
            Unread::Missing(folder) => warn!(
                library = name,
                folder, "a folder of this library is not there; kept every title it holds"
            ),
            Unread::Empty(folder) => warn!(
                library = name,
                folder,
                "a folder of this library holds no video file (an empty mount point?); kept every title it holds"
            ),
            Unread::Unreadable(entries) => warn!(
                library = name,
                entries,
                "entries of this library could not be read (a link whose target is not mounted?); kept every title it holds"
            ),
        }
    }
}

fn after_removing(dropped: usize, error: anyhow::Error) -> anyhow::Error {
    if dropped == 0 {
        return error;
    }
    error.context(format!(
        "the walk failed after it removed the libraries that left the configuration: {dropped}"
    ))
}

/// Write the built-in demo catalogue, for a server with no library to walk.
pub fn seed_demo(_turn: &WalkTurn, db: &Pool) -> anyhow::Result<ScanData> {
    let mut data = crate::services::demo::demo_data();
    HeldEpisodes::read(db).note_changed(&mut data);
    db::sync_all(db, &data.libraries, &data.shows, &data.items, &data.mtimes)?;
    Ok(data)
}

/// Tells clients that a walk in progress put titles in the catalogue: one
/// `library.updated` at most per two seconds, and none while the batches write
/// nothing. A batch it holds back is announced with the next one, or by
/// [`Self::flush`] when the scan ends without a whole walk.
pub struct BatchAnnouncer<'a> {
    events: &'a Bus,
    unannounced: bool,
    announced_at: Option<Instant>,
}

impl<'a> BatchAnnouncer<'a> {
    pub fn new(events: &'a Bus) -> Self {
        Self {
            events,
            unannounced: false,
            announced_at: None,
        }
    }

    pub fn wrote(&mut self, rows: usize) {
        self.wrote_at(rows, Instant::now());
    }

    fn wrote_at(&mut self, rows: usize, now: Instant) {
        self.unannounced |= rows > 0;
        let due = self
            .announced_at
            .is_none_or(|at| now.duration_since(at) >= ANNOUNCE_EVERY);
        if due {
            self.flush_at(now);
        }
    }

    /// Announces what the batches wrote and no `library.updated` has covered
    /// yet.
    pub fn flush(&mut self) {
        self.flush_at(Instant::now());
    }

    fn flush_at(&mut self, now: Instant) {
        if self.unannounced {
            self.events.publish(ServerEvent::LibraryUpdated);
            self.unannounced = false;
            self.announced_at = Some(now);
        }
    }
}

#[cfg(test)]
mod tests;
