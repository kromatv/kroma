use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use tracing::{info, warn};

use crate::db;
use crate::infra::events::ServerEvent;
use crate::infra::metadata::Target;
use crate::model::{MediaItem, Show};
use crate::services::activity::{self, Shared as Activity};
use crate::services::search::SearchEngine;
use crate::state::SharedState;

use super::engine::{engine_for, Counters, Engine, FinishGuard};
use super::jobs::{art_intact, build_jobs, load_pins, pin_for, Job};
use super::process::process_job;

// TMDB allows ~50 rps; every worker is another SQLite writer.
pub(super) fn workers() -> usize {
    std::thread::available_parallelism()
        .map(std::num::NonZeroUsize::get)
        .unwrap_or(4)
        .clamp(2, 8)
}

pub struct EnrichSummary {
    pub total: usize,
    pub resolved: usize,
    pub missed: usize,
    pub failed: usize,
    pub cancelled: bool,
}

/// Returns immediately; work proceeds on detached threads.
///
/// Only the titles with a TMDB call to make, because this runs after every scan
/// and one imported film must not re-resolve the whole catalog: a title that
/// matched and kept its art is left alone, and so is a show whose episodes the
/// scan did not move. The sweep that does revisit everything is the nightly
/// `pipeline.metadata` stage.
pub fn maybe_spawn(state: &SharedState, changed_shows: &HashSet<String>) {
    let Some(api_key) = state.config.tmdb_api_key.clone() else {
        return;
    };
    if !state.config.tmdb_enrich {
        return;
    }
    let jobs = match jobs_after_scan(state, changed_shows) {
        Ok(jobs) => jobs,
        Err(e) => {
            warn!(error = %e, "could not read the catalog; enrichment waits for the nightly stage");
            return;
        }
    };
    if jobs.is_empty() {
        return;
    }
    let total = jobs.len();
    info!(titles = total, "starting background TMDB enrichment");
    activity::enrich_started(&state.activity, total);
    spawn(
        engine_for(state, api_key),
        state.activity.clone(),
        state.search.clone(),
        jobs,
    );
}

pub(super) fn jobs_after_scan(
    state: &SharedState,
    changed_shows: &HashSet<String>,
) -> anyhow::Result<Vec<Job>> {
    let items = db::list_items(&state.db, None)?;
    let shows = db::list_shows(&state.db, None)?;
    let mut jobs = build_jobs(&items, &shows, &load_pins(&state.db), &state.config.data_dir);
    jobs.retain(|job| job.fetches(changed_shows));
    Ok(jobs)
}

pub(super) fn spawn(eng: Engine, activity: Activity, search: Arc<SearchEngine>, jobs: Vec<Job>) {
    let total = jobs.len();
    let queue = Arc::new(Mutex::new(jobs));
    let counters = Arc::new(Counters::default());
    thread::spawn(move || {
        let worker_count = workers().min(total.max(1));
        let mut handles = Vec::with_capacity(worker_count);
        for _ in 0..worker_count {
            let (eng, queue, counters, activity) = (
                eng.clone(),
                queue.clone(),
                counters.clone(),
                activity.clone(),
            );
            handles.push(thread::spawn(move || loop {
                let job = match queue.lock().unwrap().pop() {
                    Some(j) => j,
                    None => break,
                };
                process_job(&eng, &counters, total, Some(&activity), job);
            }));
        }
        for h in handles {
            let _ = h.join();
        }
        let resolved = counters.resolved.load(Ordering::Relaxed);
        activity::enrich_completed(&activity);
        info!(resolved, total, "TMDB enrichment complete");
        eng.bus
            .publish(ServerEvent::EnrichCompleted { resolved, total });
        match search.reindex_from_db(&eng.pool) {
            Ok(()) => info!("search index rebuilt after enrichment"),
            Err(e) => warn!(error = %e, "search reindex after enrichment failed"),
        }
    });
}

/// Idempotent. A TMDB *miss* returns `Ok` so the ledger records it done and does
/// not retry it every run; `Err` means a real write failure.
pub fn enrich_one(state: &SharedState, id: &str, is_show: bool) -> anyhow::Result<()> {
    let Some(api_key) = state.config.tmdb_api_key.clone() else {
        return Ok(());
    };
    let job = if is_show {
        let Some(show) = db::get_show(&state.db, id)?.map(|d| d.show) else {
            return Ok(());
        };
        let on_file = show
            .metadata
            .as_ref()
            .map(|m| m.tmdb_id)
            .filter(|&i| i != 0);
        let pin = pin_for(state, db::metadata_core::SHOW, id).filter(|&p| Some(p) != on_file);
        let intact = art_intact(&state.config.data_dir, show.metadata.as_ref());
        Job {
            id: show.id.clone(),
            target: Target::Tv,
            title: show.title.clone(),
            year: show.year,
            is_show: true,
            resolved_tmdb: on_file.filter(|_| pin.is_none() && intact),
            pin,
            refetch: on_file.filter(|_| pin.is_none() && !intact),
        }
    } else {
        let Some(item) = db::get_item(&state.db, id)? else {
            return Ok(());
        };
        let on_file = item
            .metadata
            .as_ref()
            .map(|m| m.tmdb_id)
            .filter(|&i| i != 0);
        let pin = pin_for(state, db::metadata_core::ITEM, id).filter(|&p| Some(p) != on_file);
        let intact = art_intact(&state.config.data_dir, item.metadata.as_ref());
        Job {
            id: item.id.clone(),
            target: Target::Movie,
            title: item.title.clone(),
            year: item.year,
            is_show: false,
            resolved_tmdb: on_file.filter(|_| pin.is_none() && intact),
            pin,
            refetch: on_file.filter(|_| pin.is_none() && !intact),
        }
    };
    let eng = engine_for(state, api_key);
    let counters = Counters::default();
    process_job(&eng, &counters, 1, None, job);
    if counters.failed.load(Ordering::Relaxed) > 0 {
        anyhow::bail!("failed to store metadata for {id}");
    }
    Ok(())
}

pub(super) fn enrich_worker(
    eng: &Engine,
    queue: &Mutex<Vec<Job>>,
    counters: &Counters,
    cancel: &AtomicBool,
    total: usize,
) {
    let _done = FinishGuard(counters);
    loop {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        let job = match queue.lock().unwrap().pop() {
            Some(j) => j,
            None => break,
        };
        process_job(eng, counters, total, None, job);
    }
}

/// Blocks the caller, reporting through `progress` and stopping early when
/// `cancelled()` returns true. Ignores the `tmdb_enrich` toggle: it is an
/// explicit admin action.
pub fn run_tracked(
    state: &SharedState,
    items: &[MediaItem],
    shows: &[Show],
    progress: impl Fn(usize, usize),
    cancelled: impl Fn() -> bool,
) -> EnrichSummary {
    let jobs = build_jobs(items, shows, &load_pins(&state.db), &state.config.data_dir);
    let total = jobs.len();
    let Some(api_key) = state.config.tmdb_api_key.clone() else {
        return EnrichSummary {
            total,
            resolved: 0,
            missed: 0,
            failed: 0,
            cancelled: false,
        };
    };
    if total == 0 {
        return EnrichSummary {
            total,
            resolved: 0,
            missed: 0,
            failed: 0,
            cancelled: false,
        };
    }
    let eng = engine_for(state, api_key);
    let queue = Arc::new(Mutex::new(jobs));
    let counters = Arc::new(Counters::default());
    let cancel = Arc::new(AtomicBool::new(false));
    let worker_count = workers().min(total.max(1));
    let mut handles = Vec::with_capacity(worker_count);
    for _ in 0..worker_count {
        let (eng, queue, counters, cancel) =
            (eng.clone(), queue.clone(), counters.clone(), cancel.clone());
        handles.push(thread::spawn(move || {
            enrich_worker(&eng, &queue, &counters, &cancel, total)
        }));
    }
    loop {
        thread::sleep(std::time::Duration::from_millis(250));
        progress(counters.processed.load(Ordering::Relaxed), total);
        if cancelled() {
            cancel.store(true, Ordering::Relaxed);
        }
        if counters.finished.load(Ordering::Relaxed) >= worker_count {
            break;
        }
    }
    for h in handles {
        let _ = h.join();
    }
    progress(counters.processed.load(Ordering::Relaxed), total);
    EnrichSummary {
        total,
        resolved: counters.resolved.load(Ordering::Relaxed),
        missed: counters.missed.load(Ordering::Relaxed),
        failed: counters.failed.load(Ordering::Relaxed),
        cancelled: cancel.load(Ordering::Relaxed),
    }
}
