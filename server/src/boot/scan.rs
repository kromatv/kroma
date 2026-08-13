//! The startup library walk. It stats every file in every library, which on a
//! network mount is latency measured in seconds, so a server that already has
//! an index serves it and rescans behind the open port (see `spawn_startup_scan`).

use anyhow::Context;
use kroma_db as db;
use kroma_engine::{infra, services, state};
use tracing::{info, warn};

/// What the boot decided about the startup walk: either it already ran (a
/// server with nothing indexed has to wait for it), or it is owed once the port
/// is open.
pub enum Plan {
    /// The walk ran synchronously; this is what it produced.
    Applied(services::scan::ScanData),
    /// The walk ran and found nothing where a configured library should be, so
    /// nothing was written. There is no catalog to announce, but the watcher
    /// still starts: it is what notices the mount coming back.
    Offline,
    /// The stored index is being served; the walk runs behind the open port.
    Deferred { library_defs: Vec<services::settings::LibraryDef>, has_folders: bool, media_dirs: usize },
}

impl Plan {
    /// Feed a scan that already ran into the state it configures.
    pub fn applied(&self, state: &state::SharedState) {
        match self {
            Plan::Applied(data) => apply_startup_scan(state, data),
            Plan::Offline => infra::watch::spawn(state.clone(), 0),
            Plan::Deferred { .. } => {}
        }
    }

    /// Start the deferred walk. Called after the port is open, never before.
    pub fn deferred(self, state: &state::SharedState) {
        if let Plan::Deferred { library_defs, has_folders, media_dirs } = self {
            spawn_startup_scan(state.clone(), library_defs, has_folders, media_dirs);
        }
    }
}

/// Decide whether the walk can wait. A server with an index serves it and
/// rescans behind the port; a server with nothing to serve waits for the walk.
pub fn plan(
    db: &db::Pool,
    config: &kroma_config::Config,
    settings: &services::settings::Settings,
) -> anyhow::Result<Plan> {
    let library_defs = services::settings::library_defs(settings, config);
    let has_folders = library_defs.iter().any(|d| !d.folders.is_empty());
    let media_dirs = config.media_dirs.len();
    let indexed = db::counts(db).map(|(_, items, _)| items).unwrap_or(0);
    if indexed > 0 {
        info!(items = indexed, "serving the stored index; rescanning after the port opens");
        return Ok(Plan::Deferred { library_defs, has_folders, media_dirs });
    }
    Ok(match startup_scan(db, &library_defs, has_folders, media_dirs)? {
        services::scan::Scanned::Applied(data) => Plan::Applied(data),
        services::scan::Scanned::MountOffline => Plan::Offline,
    })
}

// Phase 1: walk + stat only, no ffprobe; codecs/duration/HDR fill in later.
fn startup_scan(
    db: &db::Pool,
    library_defs: &[services::settings::LibraryDef],
    has_folders: bool,
    media_dirs: usize,
) -> anyhow::Result<services::scan::Scanned> {
    let mut data = services::scan::scan_all(library_defs);
    // Configured dirs that produce nothing mean a mount outage, not an empty
    // library: syncing that scan would cascade-delete every library.
    if data.items.is_empty() && has_folders {
        warn!(
            media_dirs,
            "configured media dirs produced no items; keeping the existing index (mount offline?) and skipping sync"
        );
        return Ok(services::scan::Scanned::MountOffline);
    }
    if data.items.is_empty() {
        info!("no media dirs configured; seeding built-in demo content");
        data = services::demo::demo_data();
    }
    db::sync_all(db, &data.libraries, &data.shows, &data.items, &data.mtimes)
        .context("failed to persist library")?;
    info!(
        libraries = data.libraries.len(),
        shows = data.shows.len(),
        items = data.items.len(),
        "library index ready (phase 1)"
    );
    Ok(services::scan::Scanned::Applied(data))
}

// The wiring a fresh scan feeds: what the console reports, what enrichment has
// left to do, and the baseline the file watcher stays quiet against.
fn apply_startup_scan(state: &state::SharedState, data: &services::scan::ScanData) {
    services::activity::scan_completed(
        &state.activity,
        data.libraries.len(),
        data.shows.len(),
        data.items.len(),
        services::scan::now_iso8601(),
    );
    services::enrich::maybe_spawn(state, &data.items, &data.shows);
    infra::watch::spawn(state.clone(), infra::watch::signature(&data.items, &data.mtimes));
}

// The same walk, behind the open port. Blocking (it stats every file), so it
// owns a thread rather than a runtime worker. A failure keeps the stored index:
// the catalog clients are already reading stays exactly as it was.
fn spawn_startup_scan(
    state: state::SharedState,
    library_defs: Vec<services::settings::LibraryDef>,
    has_folders: bool,
    media_dirs: usize,
) {
    use infra::events::ServerEvent;
    state.events.publish(ServerEvent::ScanStarted);
    services::activity::scan_started(&state.activity);
    tokio::task::spawn_blocking(move || {
        let scanned = startup_scan(&state.db, &library_defs, has_folders, media_dirs);
        if let Err(e) = &scanned {
            warn!(error = %format!("{e:#}"), "startup rescan failed; keeping the stored index");
        }
        let data = match scanned {
            Ok(services::scan::Scanned::Applied(data)) => data,
            // Nothing was written, so the counts to report are the STORED ones:
            // they are what the catalog is still serving, and announcing zero
            // would read as a library that had just been emptied. The watcher
            // starts against no baseline, so the mount coming back is a change.
            Ok(services::scan::Scanned::MountOffline) | Err(_) => {
                let (libraries, items, shows) = db::counts(&state.db).unwrap_or((0, 0, 0));
                services::activity::scan_completed(
                    &state.activity,
                    libraries,
                    shows,
                    items,
                    services::scan::now_iso8601(),
                );
                state.events.publish(ServerEvent::ScanCompleted { items, shows, libraries });
                infra::watch::spawn(state.clone(), 0);
                return;
            }
        };
        let (libraries, shows, items) = (data.libraries.len(), data.shows.len(), data.items.len());
        services::activity::scan_completed(
            &state.activity,
            libraries,
            shows,
            items,
            services::scan::now_iso8601(),
        );
        infra::watch::spawn(state.clone(), infra::watch::signature(&data.items, &data.mtimes));
        // The probe pass and the reindex `boot::background` started ran against
        // the index as it was BEFORE this walk, so the files it just added need
        // both again. Enrichment is in there too, which is why this path does
        // not go through `apply_startup_scan`.
        services::scan::spawn_follow_ups(&state, &data);
        state.events.publish(ServerEvent::ScanCompleted { items, shows, libraries });
        state.events.publish(ServerEvent::LibraryUpdated);
    });
}
