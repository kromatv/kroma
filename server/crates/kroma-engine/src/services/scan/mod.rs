//! Library scanning: walk media roots, parse names, group files into logical
//! items (Plex-style), and build the set of libraries/shows/items to persist.
//!
//! Phase 1 (this module's [`scan_all`]) is **fast**: it only `stat`s each video
//! file (size + mtime no read, no ffprobe). Files are grouped into logical
//! items so the library is browsable in seconds. The slow per-file probing runs
//! later in [`crate::infra::probe`]'s background pass.
//!
//! Split into the per-folder filesystem [`walk`] worker and the stable
//! logical-id / edition [`ids`] derivation; this module owns the orchestration
//! that aggregates them into the [`ScanData`], and [`live`] writes it into the
//! catalogue while the walk still runs.

mod batches;
mod changed_shows;
mod found;
mod ids;
mod index;
mod live;
mod unread;
pub mod walk;

use std::collections::{HashMap, HashSet};
use std::convert::Infallible;
use std::ops::ControlFlow;

use tracing::{info, warn};

use crate::model::{Library, MediaItem, Show};
use crate::services::settings::LibraryDef;

use batches::{BatchSink, BatchSize, Batches};
use found::{Found, LibraryWalk};
use live::{seed_demo, sync_walk, Walked};
use unread::read_library;

pub use ids::{movie_logical_id, short_hash};
pub use live::{uninterrupted, AfterBatch, BatchAnnouncer, WalkTurn};
pub use unread::{Unread, UnreadLibrary};

/// Everything a phase-1 scan produces.
#[derive(Debug, Default)]
pub struct ScanData {
    pub libraries: Vec<Library>,
    pub shows: Vec<Show>,
    pub items: Vec<MediaItem>,
    /// Entries the walk could not read across every folder, so an empty scan can
    /// say whether the library is genuinely empty or its symlinks dangle.
    pub unreadable: usize,
    // `file_id -> mtime-secs` for every scanned file. Carried here (rather than
    // on `MediaFile`, which is the client JSON contract) so the DB sync can
    // detect changed files. Owned by this scan no shared global, so two
    // overlapping scans (watcher rescan + `POST /api/scan`) can't steal each
    // other's entries.
    pub mtimes: HashMap<String, Option<i64>>,
    /// Shows whose episode set this scan moved, against what the database held
    /// before the scan wrote anything. Empty until a sync fills it, so a caller
    /// that never asks enriches no show on episodes alone.
    pub changed_shows: HashSet<String>,
    pub unread_libraries: Vec<UnreadLibrary>,
}

/// Walk every configured library (each may span multiple folders) and build the
/// full index (phase 1, fast: no ffprobe). Files are `stat`-ed and grouped into
/// logical items. Items from every folder of a library share that library's id.
pub fn scan_all(defs: &[LibraryDef]) -> ScanData {
    let mut unobserved = |_: &crate::db::ScanBatch<'_>| Ok::<(), Infallible>(());
    let Ok(data) = scan_in_batches(defs, BatchSize::LIVE, &mut unobserved);
    data
}

fn scan_in_batches<S>(
    defs: &[LibraryDef],
    size: BatchSize,
    sink: &mut BatchSink<'_, S>,
) -> Result<ScanData, S> {
    let mut data = ScanData::default();
    let mut found = Found::default();
    let mut batches = Batches::new(size, sink);

    for def in defs {
        let mut lib = LibraryWalk::new(def, &mut found);
        let read = read_library(&mut lib, &mut batches)?;
        data.unreadable += read.unreadable;
        data.unread_libraries.extend(read.unread);
        let library = lib.library();
        batches.close(&library, &found)?;

        info!(library = %def.name, items = library.item_count, "scanned library");
        data.libraries.push(library);
    }

    data.shows = found.shows.into_values().collect();
    data.items = found.items.into_values().collect();
    data.mtimes = found.mtimes;
    Ok(data)
}

/// Current time as an RFC3339 / ISO8601 string (UTC). Re-exported from kroma-primitives.
pub use kroma_primitives::now_iso8601;

/// What a phase-1 scan did. A cancelled one keeps what its batches wrote and
/// prunes nothing.
pub enum Scanned {
    /// The walk produced a catalog, and it was written.
    Applied(ScanData),
    /// Configured libraries produced NO items: a mount outage, not a library
    /// someone emptied. A prune reads that as "every file vanished" and
    /// cascade-deletes the catalog along with its probed metadata, so no title
    /// is written or pruned and their stored index stays authoritative.
    /// `dropped` counts the libraries that had left the configuration and were
    /// removed before the walk.
    MountOffline {
        dropped: usize,
    },
    Cancelled {
        dropped: usize,
    },
}

/// Phase-1 rescan + DB sync, demo-seeding only in demo mode (no libraries
/// configured). Pure work (no events / no background spawns) so both the `POST
/// /api/scan` handler and the `library.scan` job can share it and add their own
/// notifications. Blocking (walk + SQLite) call from a blocking context.
///
/// A saved library list that cannot be read is an error: nothing is removed
/// and no demo is seeded.
pub fn rescan_sync(
    turn: &WalkTurn,
    state: &crate::state::SharedState,
    after_batch: &mut AfterBatch<'_>,
) -> anyhow::Result<Scanned> {
    let defs = crate::services::settings::library_defs(&state.settings, &state.config)
        .map_err(|_| crate::services::settings::unreadable_list_failure(&state.db))?;
    let walk = LibrariesToWalk {
        turn,
        db: &state.db,
        defs: &defs,
    };
    walk_libraries(walk, after_batch)
}

/// What [`walk_libraries`] walks: the turn it holds, the index it writes and
/// the libraries the owner made.
pub struct LibrariesToWalk<'a> {
    pub turn: &'a WalkTurn,
    pub db: &'a crate::db::Pool,
    pub defs: &'a [LibraryDef],
}

/// Walk `defs` and write what the walk finds, or seed the demo catalogue when
/// `defs` is empty: the demo is for a server where the owner has made no
/// library. A library with no folder, or whose folders read empty, is the
/// owner's all the same: it is walked, and keeps what it holds.
pub fn walk_libraries(
    walk: LibrariesToWalk<'_>,
    after_batch: &mut AfterBatch<'_>,
) -> anyhow::Result<Scanned> {
    let LibrariesToWalk { turn, db, defs } = walk;
    if defs.is_empty() {
        info!("no libraries configured; seeding demo content");
        return seed_demo(turn, db).map(Scanned::Applied);
    }
    match sync_walk(turn, db, defs, after_batch)? {
        Walked::Synced(data) => Ok(Scanned::Applied(data)),
        Walked::Stopped { dropped } => Ok(Scanned::Cancelled { dropped }),
        Walked::Empty {
            unreadable,
            dropped,
        } => {
            warn!(
                libraries = defs.len(),
                unreadable,
                libraries_removed = dropped,
                "configured libraries produced no items; kept their stored titles and pruned none (mount offline?)"
            );
            Ok(Scanned::MountOffline { dropped })
        }
    }
}

/// Publish "scan started", run phase-1 [`rescan_sync`], then announce the
/// catalog change with the resulting counts. Blocking; returns the synced data.
/// `cancelled` is asked after each batch the walk writes. A scan that fails
/// still announces what it wrote and its end. The caller keeps `turn` for what
/// it does with the result before another walk may start.
pub fn scan_and_publish(
    turn: &WalkTurn,
    state: &crate::state::SharedState,
    cancelled: &dyn Fn() -> bool,
) -> anyhow::Result<Scanned> {
    use crate::infra::events::ServerEvent;
    state.events.publish(ServerEvent::ScanStarted);
    crate::services::activity::scan_started(&state.activity);

    let mut announcer = BatchAnnouncer::new(&state.events);
    let scanned = rescan_sync(turn, state, &mut |rows| {
        announcer.wrote(rows);
        if cancelled() {
            ControlFlow::Break(())
        } else {
            ControlFlow::Continue(())
        }
    });
    let Ok(Scanned::Applied(data)) = &scanned else {
        publish_stored(state, &mut announcer);
        return scanned;
    };
    publish_completed(
        state,
        (data.libraries.len(), data.shows.len(), data.items.len()),
    );
    state.events.publish(ServerEvent::LibraryUpdated);
    scanned
}

/// Announce the end of a scan that has no whole walk to report: an outage, a
/// cancel or a failure. What its batches wrote is announced first. The counts
/// are the STORED ones: they are what the catalog is serving, and announcing
/// zero would read as a library that had just been emptied.
pub fn publish_stored(state: &crate::state::SharedState, announcer: &mut BatchAnnouncer<'_>) {
    announcer.flush();
    let (libraries, items, shows) = crate::db::counts(&state.db).unwrap_or((0, 0, 0));
    publish_completed(state, (libraries, shows, items));
}

fn publish_completed(
    state: &crate::state::SharedState,
    (libraries, shows, items): (usize, usize, usize),
) {
    crate::services::activity::scan_completed(
        &state.activity,
        libraries,
        shows,
        items,
        now_iso8601(),
    );
    state
        .events
        .publish(crate::infra::events::ServerEvent::ScanCompleted {
            items,
            shows,
            libraries,
        });
}

/// Kick the phase-2 background follow-ups after a scan media probing, search
/// reindex and TMDB enrichment (each reports its own progress in the activity
/// feed). Shared by `POST /api/scan` and the `library.scan` job.
pub fn spawn_follow_ups(state: &crate::state::SharedState, data: &ScanData) {
    crate::infra::probe::spawn_probe_pass(
        state.db.clone(),
        state.ffprobe_available,
        state.events.clone(),
        state.activity.clone(),
    );
    crate::services::search::spawn_reindex(state.clone());
    crate::services::enrich::maybe_spawn(state, &data.changed_shows);
}

/// Keep the shows a scan changed for the next scan, for a caller that does
/// not start [`spawn_follow_ups`]: the walk has settled them and enrichment
/// has not seen them, so the next walk that ends reports them as changed again.
pub fn hold_changed_shows(
    state: &crate::state::SharedState,
    data: &ScanData,
) -> anyhow::Result<()> {
    crate::db::unsettle_shows(&state.db, &data.changed_shows)
}

#[cfg(test)]
mod tests;
