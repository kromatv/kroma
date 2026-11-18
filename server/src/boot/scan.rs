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
    Deferred,
}

impl Plan {
    /// Feed a scan that already ran into the state it configures.
    pub fn applied(&self, state: &state::SharedState) {
        match self {
            Plan::Applied(data) => apply_startup_scan(state, data),
            Plan::Offline => infra::watch::spawn(state.clone(), 0),
            Plan::Deferred => {}
        }
    }

    /// Start the deferred walk. Called after the port is open, never before.
    pub fn deferred(self, state: &state::SharedState) {
        if matches!(self, Plan::Deferred) {
            spawn_startup_scan(state.clone());
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
    // Written before the definitions are read, because with nothing configured
    // the definitions ARE the demo library and a scan of folders that do not
    // exist yet would find nothing.
    if demo_media_wanted(config, settings) {
        services::demo::media::ensure(&config.data_dir);
    }
    let indexed = db::counts(db).map(|(_, items, _)| items).unwrap_or(0);
    if indexed > 0 {
        info!(
            items = indexed,
            "serving the stored index; rescanning after the port opens"
        );
        return Ok(Plan::Deferred);
    }
    let turn = services::scan::WalkTurn::wait();
    let library_defs = services::settings::library_defs(settings, config);
    let scanned = startup_scan(
        &turn,
        db,
        &library_defs,
        config.media_dirs.len(),
        &mut services::scan::uninterrupted,
    )?;
    Ok(match scanned {
        services::scan::Scanned::Applied(data) => Plan::Applied(data),
        services::scan::Scanned::MountOffline | services::scan::Scanned::Cancelled => Plan::Offline,
    })
}

// Only for a server with no library of its own: nothing configured, nothing
// persisted, and the operator has not turned it off (`KROMA_DEMO_MEDIA=0`).
fn demo_media_wanted(
    config: &kroma_config::Config,
    settings: &services::settings::Settings,
) -> bool {
    if !config.demo_media {
        return false;
    }
    config.media_dirs.is_empty()
        && config.movies_dirs.is_empty()
        && config.series_dirs.is_empty()
        && !matches!(settings.get("libraries"), serde_json::Value::Array(_))
}

// Phase 1: walk + stat only, no ffprobe; codecs/duration/HDR fill in later.
fn startup_scan(
    turn: &services::scan::WalkTurn,
    db: &db::Pool,
    library_defs: &[services::settings::LibraryDef],
    media_dirs: usize,
    after_batch: &mut services::scan::AfterBatch<'_>,
) -> anyhow::Result<services::scan::Scanned> {
    use services::scan::Walked;
    if library_defs.iter().all(|def| def.folders.is_empty()) {
        info!("no media dirs configured; seeding built-in demo content");
        let data = services::scan::seed_demo(turn, db).context("failed to persist library")?;
        return Ok(index_ready(data));
    }
    let walked = services::scan::sync_walk(turn, db, library_defs, after_batch)
        .context("failed to persist library")?;
    match walked {
        Walked::Synced(data) => Ok(index_ready(data)),
        Walked::Stopped => Ok(services::scan::Scanned::Cancelled),
        // Configured dirs that produce nothing mean a mount outage, not an empty
        // library: syncing that scan would cascade-delete every library.
        Walked::Empty { .. } => {
            warn!(
                media_dirs,
                "configured media dirs produced no items; keeping the existing index (mount offline?) and skipping sync"
            );
            Ok(services::scan::Scanned::MountOffline)
        }
    }
}

fn index_ready(data: services::scan::ScanData) -> services::scan::Scanned {
    info!(
        libraries = data.libraries.len(),
        shows = data.shows.len(),
        items = data.items.len(),
        "library index ready (phase 1)"
    );
    services::scan::Scanned::Applied(data)
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
    services::enrich::maybe_spawn(state, &data.changed_shows);
    infra::watch::spawn(
        state.clone(),
        infra::watch::signature(&data.items, &data.mtimes),
    );
}

// The same walk, behind the open port. Blocking (it stats every file), so it
// owns a thread rather than a runtime worker. A failure keeps the stored index:
// the catalog clients are already reading stays exactly as it was.
fn spawn_startup_scan(state: state::SharedState) {
    use infra::events::ServerEvent;
    state.events.publish(ServerEvent::ScanStarted);
    services::activity::scan_started(&state.activity);
    tokio::task::spawn_blocking(move || {
        let turn = services::scan::WalkTurn::wait();
        let library_defs = services::settings::library_defs(&state.settings, &state.config);
        let mut announcer = services::scan::BatchAnnouncer::new(&state.events);
        let scanned = startup_scan(
            &turn,
            &state.db,
            &library_defs,
            state.config.media_dirs.len(),
            &mut |rows| {
                announcer.wrote(rows);
                std::ops::ControlFlow::Continue(())
            },
        );
        if let Err(e) = &scanned {
            warn!(error = %format!("{e:#}"), "startup rescan failed; keeping the stored index");
        }
        let data = match scanned {
            Ok(services::scan::Scanned::Applied(data)) => data,
            // The watcher starts against no baseline, so the mount coming back
            // is a change.
            Ok(services::scan::Scanned::MountOffline | services::scan::Scanned::Cancelled)
            | Err(_) => {
                services::scan::publish_stored(&state, &mut announcer);
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
        infra::watch::spawn(
            state.clone(),
            infra::watch::signature(&data.items, &data.mtimes),
        );
        // The probe pass and the reindex `boot::background` started ran against
        // the index as it was BEFORE this walk, so the files it just added need
        // both again. Enrichment is in there too, which is why this path does
        // not go through `apply_startup_scan`.
        services::scan::spawn_follow_ups(&state, &data);
        state.events.publish(ServerEvent::ScanCompleted {
            items,
            shows,
            libraries,
        });
        state.events.publish(ServerEvent::LibraryUpdated);
    });
}

#[cfg(test)]
mod tests;
