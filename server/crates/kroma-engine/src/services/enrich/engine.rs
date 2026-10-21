use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use crate::db::Pool;
use crate::infra::events::{Bus, ServerEvent};
use crate::infra::metadata::Cache;
use crate::point::Point;
use crate::services::activity::{self, Shared as Activity};
use crate::state::SharedState;

#[derive(Clone)]
pub(super) struct Engine {
    pub(super) pool: Pool,
    pub(super) cache: Arc<Cache>,
    pub(super) api_key: String,
    pub(super) language: String,
    pub(super) data_dir: PathBuf,
    pub(super) theme_songs: bool,
    pub(super) bus: Bus,
    pub(super) embedder: Point,
}

#[derive(Default)]
pub(super) struct Counters {
    pub(super) processed: AtomicUsize,
    pub(super) resolved: AtomicUsize,
    pub(super) missed: AtomicUsize,
    pub(super) failed: AtomicUsize,
    pub(super) finished: AtomicUsize,
}

// Counts a worker done on every exit path, including an unwinding panic in
// `process_job`: `run_tracked` polls for `finished == worker_count`, so a bare
// `fetch_add` after the loop would hang the (uncancellable) job forever.
pub(super) struct FinishGuard<'a>(pub(super) &'a Counters);
impl Drop for FinishGuard<'_> {
    fn drop(&mut self) {
        self.0.finished.fetch_add(1, Ordering::Relaxed);
    }
}

pub(super) fn engine_for(state: &SharedState, api_key: String) -> Engine {
    Engine {
        pool: state.db.clone(),
        cache: state.metadata_cache.clone(),
        api_key,
        language: crate::services::settings::metadata_language(&state.settings, &state.config),
        data_dir: state.config.data_dir.clone(),
        theme_songs: crate::services::settings::theme_songs_enabled(&state.settings),
        bus: state.events.clone(),
        embedder: state.embedder.clone(),
    }
}

pub(super) fn bump(eng: &Engine, counters: &Counters, total: usize, activity: Option<&Activity>) {
    let done = counters.processed.fetch_add(1, Ordering::Relaxed) + 1;
    if let Some(activity) = activity {
        activity::enrich_progress(activity, done);
        if done.is_multiple_of(25) {
            eng.bus.publish(ServerEvent::EnrichProgress { done, total });
        }
    }
}
