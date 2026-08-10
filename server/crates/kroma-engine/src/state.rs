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
use crate::services::pairing::{handoff, quickconnect, Handoff, QuickConnect};
use crate::services::search::SearchEngine;
use crate::services::sections::VectorCache;
use crate::services::settings::Settings;
use crate::services::subtitles::GenRegistry;
use crate::infra::hls;

pub struct AppState {
    pub config: Config,
    pub ffprobe_available: bool,
    pub db: Pool,
    pub settings: Settings,
    pub metadata_cache: Arc<metadata::Cache>,
    pub events: Bus,
    pub activity: activity::Shared,
    pub hls: hls::HlsEngine,
    pub storyboard: Storyboard,
    pub quickconnect: QuickConnect,
    pub handoff: Handoff,
    pub playback: Registry,
    pub cast: crate::services::cast::Registry,
    pub metrics: Metrics,
    pub embedder: Arc<dyn Embedder>,
    pub search: Arc<SearchEngine>,
    pub vectors: Arc<VectorCache>,
    pub jobs: Arc<JobManager>,
    pub subtitle_gen: Arc<GenRegistry>,
    pub instance_id: String,
    // Semaphore for offline-download remuxes; a full gate returns `503`
    // rather than queueing, since a permit is held for the whole transfer.
    pub downloads: Arc<tokio::sync::Semaphore>,
    me: std::sync::Weak<AppState>,
    pub(crate) services:
        std::collections::HashMap<std::any::TypeId, std::sync::Arc<dyn std::any::Any + Send + Sync>>,
    // The harness's scratch `data_dir`, held here rather than by the test body:
    // a test hands clones of this state to background jobs, so the last handle
    // to go is the only one that outlives everything writing into the dir.
    #[cfg(test)]
    scratch_dir: std::sync::OnceLock<kroma_testing::TempDir>,
}

pub type SharedState = Arc<AppState>;

impl AppState {
    /// Re-shares this state as an `Arc` (e.g. to trigger a job). `None` only
    /// before the self-reference is seeded in [`AppState::new`].
    pub(crate) fn shared(&self) -> Option<SharedState> {
        self.me.upgrade()
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
            handoff: handoff::new(),
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
            #[cfg(test)]
            scratch_dir: std::sync::OnceLock::new(),
        })
    }
}

#[cfg(test)]
impl AppState {
    pub(crate) fn own_scratch_dir(&self, dir: kroma_testing::TempDir) {
        assert!(self.scratch_dir.set(dir).is_ok(), "the scratch dir is handed over once");
    }
}
