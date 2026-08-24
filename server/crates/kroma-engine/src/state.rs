//! Process-wide application state. The library lives in SQLite; this just holds
//! the connection pool, resolved config, and the ffprobe-availability flag.

use std::sync::Arc;

use crate::config::Config;
use crate::db::Pool;
use crate::infra::events::Bus;
use crate::infra::hls;
use crate::infra::metadata;
use crate::infra::metrics::Metrics;
use crate::infra::storyboard::Storyboard;
use crate::services::activity;
use crate::services::jobs::JobManager;
use crate::services::pairing::{handoff, quickconnect, Handoff, QuickConnect};
use crate::services::playback::Registry;
use crate::services::search::SearchEngine;
use crate::services::sections::VectorCache;
use crate::services::settings::Settings;
use crate::services::subtitles::GenRegistry;

/// Resolves a point name to every module currently contributing it. The core
/// holds only this: it never learns which module answers, or what the point is
/// for.
pub type Contributions =
    std::sync::Arc<dyn Fn(&str) -> Vec<kroma_module_host::Contribution> + Send + Sync>;

/// Everything the composition root (the binary) contributes from module crates,
/// bundled so the core roster keeps naming no module type. See [`AppState::new`].
pub struct ModuleWiring {
    // Module services + peer ports, resolved by type through the `HostCtx` seam.
    pub services: std::collections::HashMap<
        std::any::TypeId,
        std::sync::Arc<dyn std::any::Any + Send + Sync>,
    >,
    // Background jobs contributed by module crates, run alongside the built-ins.
    pub jobs: &'static [crate::services::jobs::Builtin],
    // Resolves a port contract name to the running provider's `(base_url, token)`.
    pub contributions: Contributions,
}

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
    // The `embedder` point: the core's search asks whichever module answers it
    // for vectors, and finds nothing when none does.
    pub embedder: crate::point::Point,
    pub search: Arc<SearchEngine>,
    pub vectors: Arc<VectorCache>,
    pub jobs: Arc<JobManager>,
    pub subtitle_gen: Arc<GenRegistry>,
    pub instance_id: String,
    // Semaphore for offline-download remuxes; a full gate returns `503`
    // rather than queueing, since a permit is held for the whole transfer.
    pub downloads: Arc<tokio::sync::Semaphore>,
    me: std::sync::Weak<AppState>,
    // Set by the composition root from the module supervisor. A FUNCTION, not
    // the supervisor itself: the engine must not name it, and this is the whole
    // of what the core knows about reaching a module.
    pub(crate) contributions: Contributions,
    pub(crate) services: std::collections::HashMap<
        std::any::TypeId,
        std::sync::Arc<dyn std::any::Any + Send + Sync>,
    >,
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
        // The `embedder` point, built by the composition root from the same
        // resolver it passes below. A test hands in a stub; a server with no
        // module answering it finds nothing rather than failing.
        embedder: crate::point::Point,
        // Module-contributed wiring (services, jobs, port contributions), built
        // by the binary so the core roster names no module.
        wiring: ModuleWiring,
    ) -> SharedState {
        let ModuleWiring {
            services: module_services,
            jobs: module_jobs,
            contributions,
        } = wiring;
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
        crate::infra::ffmpeg_gate::set_capacity(crate::services::settings::media_workers(
            &settings,
        ));
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
            contributions,
            services,
            #[cfg(test)]
            scratch_dir: std::sync::OnceLock::new(),
        })
    }
}

#[cfg(test)]
impl AppState {
    pub(crate) fn own_scratch_dir(&self, dir: kroma_testing::TempDir) {
        assert!(
            self.scratch_dir.set(dir).is_ok(),
            "the scratch dir is handed over once"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Category;
    use crate::services::jobs::{Builtin, JobContext, JobKey};

    static CONTRIBUTED_RUNS: std::sync::atomic::AtomicUsize =
        std::sync::atomic::AtomicUsize::new(0);

    fn count_a_run(_ctx: &JobContext) -> anyhow::Result<()> {
        CONTRIBUTED_RUNS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        Ok(())
    }

    static MODULE_JOB: &[Builtin] = &[Builtin {
        key: JobKey("test.module.contributed"),
        category: Category::Maintenance,
        schedule: Some("0 3 * * *"),
        triggers: &[],
        run: count_a_run,
    }];

    #[test]
    fn a_modules_own_jobs_join_the_roster_beside_the_built_ins() {
        let dir = kroma_testing::temp_dir("state-module-jobs");
        let db = crate::db::init(&dir.path().join("kroma.db")).unwrap();
        let settings = Settings::load(&db);
        let config = Config {
            host: "127.0.0.1".into(),
            port: 0,
            data_dir: dir.path().to_path_buf(),
            tmdb_language: "en-US".into(),
            ..Default::default()
        };
        let state = AppState::new(
            config,
            false,
            db,
            settings,
            crate::point::Point::absent("embedder"),
            ModuleWiring {
                services: std::collections::HashMap::new(),
                jobs: MODULE_JOB,
                contributions: Arc::new(|_| Vec::new()),
            },
        );
        state.own_scratch_dir(dir);

        let keys: Vec<String> = state.jobs.list(&state).into_iter().map(|j| j.key).collect();
        assert!(
            keys.iter().any(|k| k == "test.module.contributed"),
            "the module job should be registered: {keys:?}"
        );
        assert!(keys.len() > 1, "the built-ins are still there");

        assert!(
            state.jobs.resolve("test.module.contributed").is_some(),
            "and it is triggerable"
        );
        (MODULE_JOB[0].run)(&JobContext::for_test(state.clone())).unwrap();
        assert_eq!(
            CONTRIBUTED_RUNS.load(std::sync::atomic::Ordering::Relaxed),
            1
        );
    }
}
