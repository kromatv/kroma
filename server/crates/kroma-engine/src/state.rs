//! Process-wide application state. The library lives in SQLite; this just holds
//! the connection pool, resolved config, and the ffprobe-availability flag.

use std::sync::Arc;

use crate::services::activity;
use crate::config::Config;
use crate::db::Pool;
use crate::ports::Embedder;
use crate::infra::events::Bus;
use crate::infra::metadata;
use crate::infra::metrics::Metrics;
use crate::infra::storyboard::Storyboard;
use crate::services::jobs::JobManager;
use crate::services::playback::Registry;
use crate::services::quickconnect::{self, QuickConnect};
use crate::services::search::SearchEngine;
use crate::services::sections::VectorCache;
use crate::services::settings::Settings;
use crate::services::subtitles::GenRegistry;
use crate::infra::hls;

pub struct AppState {
    pub config: Config,
    /// Whether the `ffprobe` binary was found at startup.
    pub ffprobe_available: bool,
    pub db: Pool,
    /// Persisted, runtime-editable server settings (admin console).
    pub settings: Settings,
    /// In-memory TMDB lookup cache, shared across requests and the background
    /// enrichment threads (hence `Arc`).
    pub metadata_cache: Arc<metadata::Cache>,
    /// Real-time event bus fanned out to WebSocket clients.
    pub events: Bus,
    /// Live scan/enrichment status snapshot (served at `/api/status`).
    pub activity: activity::Shared,
    /// On-demand HLS engine: keyframe-indexed complete-VOD playlists + cached
    /// stream-copy fMP4 segments (video copy, audio copy or AAC) for browsers
    /// that can't direct-play the container/audio, and seamless language switch.
    pub hls: hls::HlsEngine,
    /// Scrub-bar preview sprite sheets (YouTube-style hover thumbnails), built
    /// once per file with one ffmpeg pass and cached on disk.
    pub storyboard: Storyboard,
    /// In-flight Quick Connect device-pairing requests.
    pub quickconnect: QuickConnect,
    /// Live playback sessions (the dashboard's "En cours de lecture" panel).
    pub playback: Registry,
    /// Live cast receivers: the TVs a phone or a browser can drive right now.
    pub cast: crate::services::cast::Registry,
    /// Rolling CPU / RAM / bandwidth metrics (the dashboard charts).
    pub metrics: Metrics,
    /// Content embedder, built once at startup (the MiniLM backend loads a model;
    /// the default lexical one is free). Used to embed titles during enrichment
    /// and free-text queries for the `/api/themed` row.
    pub embedder: Arc<dyn Embedder>,
    /// In-RAM full-text search index (keyword/typo-tolerant title search behind
    /// `/api/search`). Rebuilt from SQLite on scan/enrich. Internally synchronized.
    pub search: Arc<SearchEngine>,
    /// In-RAM snapshot of every title's embedding, powering the home-screen
    /// section generator without re-reading SQLite per request. Self-reloads when
    /// the vectors change (see [`crate::services::sections::VectorCache`]).
    pub vectors: Arc<VectorCache>,
    /// Background job registry + cron scheduler (admin "Tâches" console). Built
    /// at startup with the built-in jobs; the scheduler is spawned in `main`.
    pub jobs: Arc<JobManager>,
    /// In-flight on-device subtitle generations (Whisper / translate), tracked so
    /// the player can poll live progress + ETA and cancel.
    pub subtitle_gen: Arc<GenRegistry>,
    /// Stable identity of this install, served on `/api/health` so a client can
    /// tell "the same server through two origins" from "two servers".
    pub instance_id: String,
    /// Admission control for offline-download remuxes. Each one holds an ffmpeg
    /// for the whole transfer (minutes, not the seconds an HLS segment takes), so
    /// unlike the HLS semaphore a full gate returns `503` instead of queueing:
    /// a phone that waits an hour for a permit has already timed out.
    pub downloads: Arc<tokio::sync::Semaphore>,
    /// Weak self-reference (seeded via `Arc::new_cyclic`) so a relocated module's
    /// `HostCtx::trigger_job` can hand a background job the full `SharedState` it
    /// runs against (jobs are `Fn(SharedState)`, and the `Arc` is otherwise lost
    /// through the blanket `Arc<T>: HostCtx` deref).
    me: std::sync::Weak<AppState>,
    /// Typed service registry for dependency injection into relocated modules:
    /// each module resolves its own engine / bridge by type through the `HostCtx`
    /// seam (`get_service`), so the binary wires nothing per module. Holds the same
    /// `Arc`s as the concrete fields above, keyed by `TypeId`.
    pub(crate) services:
        std::collections::HashMap<std::any::TypeId, std::sync::Arc<dyn std::any::Any + Send + Sync>>,
}

pub type SharedState = Arc<AppState>;

impl AppState {
    /// The `Arc<AppState>` this `&self` is inside (for the few spots that need to
    /// re-share the whole state, e.g. triggering a job). `None` only before the
    /// self-reference is seeded in [`AppState::new`].
    pub(crate) fn shared(&self) -> Option<SharedState> {
        self.me.upgrade()
    }
}

/// Remove the harness's temp `data_dir` once the last [`SharedState`] handle goes.
///
/// [`crate::test_support`] hands every test a `data_dir` under `$TMPDIR`, but the
/// path was only ever created, never removed: the `remove_dir_all` it does first
/// clears a *same-pid* name collision, and `cargo test` gets a fresh pid every
/// run, so each run left its full set behind. macOS only purges `/var/folders/…/T`
/// at boot for files untouched 3+ days, so on a dev box this grew without bound
/// (~95 GB / 219k entries in one month before this landed).
///
/// This hangs the cleanup off the state's own lifetime instead of the 157 call
/// sites, which take `SharedState = Arc<AppState>` by value and clone it freely.
/// `me` is a [`std::sync::Weak`], so the `Arc` really does reach zero and this
/// runs; any thread still holding a clone keeps the dir alive until it is done.
///
/// Guarded on "under `$TMPDIR` and named `kroma-*`" so a test that points a state
/// at a real directory never has it deleted underneath.
#[cfg(test)]
impl Drop for AppState {
    fn drop(&mut self) {
        let dir = &self.config.data_dir;
        let is_temp_harness_dir = dir.starts_with(std::env::temp_dir())
            && dir
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("kroma-"));
        if is_temp_harness_dir {
            let _ = std::fs::remove_dir_all(dir);
        }
    }
}

impl AppState {
    pub fn new(
        config: Config,
        ffprobe_available: bool,
        db: Pool,
        settings: Settings,
        // The content embedder, wrapped by the composition root (the binary) from
        // the vector module's backend into the engine port, so the core names no
        // concrete embedder crate. A `NoopEmbedder` stands in when absent.
        embedder: Arc<dyn Embedder>,
        module_services: std::collections::HashMap<
            std::any::TypeId,
            std::sync::Arc<dyn std::any::Any + Send + Sync>,
        >,
        // Background jobs contributed by module crates (e.g. the acquisition
        // jobs from the downloads module), registered alongside the built-ins
        // so the core roster names no module.
        module_jobs: &'static [crate::services::jobs::Builtin],
    ) -> SharedState {
        let hls = hls::HlsEngine::new(
            &config.data_dir,
            crate::services::settings::max_transcodes(&settings),
            crate::services::settings::transcode_cache_limit_bytes(&settings),
        );
        let storyboard = Storyboard::new(&config.data_dir);
        // Mint (or read back) this install's stable identity before anything can
        // serve `/api/health`.
        let instance_id = crate::services::settings::ensure_instance_id(&settings, &db);
        // Offline downloads draw from the same operator-facing budget as the HLS
        // remux sessions rather than inventing a second knob.
        let downloads = Arc::new(tokio::sync::Semaphore::new(
            crate::services::settings::max_transcodes(&settings),
        ));
        // Every module service + peer port (the download manager, the VPN bridge,
        // the Remote connector, the VpnProxy / TorrentFetch ports) is built by the
        // binary (the composition root) and passed in via `module_services`, so the
        // core never names those module types. Modules resolve their own engine by
        // type through the `HostCtx` seam.
        let services = module_services;
        // Seed the process-wide ffmpeg concurrency budget from the setting so the
        // very first background pass already honors it (updated live on write).
        crate::infra::ffmpeg_gate::set_capacity(crate::services::settings::media_workers(&settings));
        // Build the job registry: register the built-ins, then overlay any
        // persisted schedule overrides. The cron loop is spawned in `main`.
        let mut jobs = JobManager::new();
        crate::services::jobs::register_all(&mut jobs);
        // Overlay the module-contributed jobs (e.g. acquisition) so the core
        // roster stays module-free while their handlers still run.
        for b in module_jobs {
            jobs.register(b);
        }
        jobs.load_schedules(&db);
        // Restore the persisted global pipeline-pause so a box rebooted while held
        // stays held until an admin resumes (visible in the Pipeline console).
        jobs.set_pipeline_paused(settings.get_bool("pipelinePaused", false));
        // Any run left `running` belongs to a previous process that died mid-job;
        // mark it failed so it doesn't show as forever-running in the console.
        let _ = crate::db::reconcile_running_runs(&db);
        // Likewise, reset any pipeline ledger task stranded `running` by that
        // crash back to `pending` so its stage picks it up again.
        crate::services::pipeline::recover_on_boot(&db);
        // `new_cyclic` seeds the weak self-reference (`me`) during construction so
        // `trigger_job` can re-share the full state; the closure is FnOnce, so the
        // pre-built services above move straight in.
        Arc::new_cyclic(|weak| AppState {
            config,
            ffprobe_available,
            db,
            settings,
            metadata_cache: Arc::new(metadata::Cache::new()),
            events: Bus::new(),
            activity: activity::new(),
            hls,
            storyboard,
            quickconnect: quickconnect::new(),
            playback: Registry::new(),
            cast: crate::services::cast::Registry::new(),
            metrics: Metrics::new(),
            embedder,
            search: Arc::new(SearchEngine::new().expect("init search index")),
            vectors: Arc::new(VectorCache::new()),
            jobs: Arc::new(jobs),
            subtitle_gen: Arc::new(GenRegistry::default()),
            instance_id,
            downloads,
            me: weak.clone(),
            services,
        })
    }
}
