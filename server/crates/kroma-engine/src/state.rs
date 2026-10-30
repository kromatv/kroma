//! Process-wide application state. The library lives in SQLite; this just holds
//! the connection pool, resolved config, and the ffprobe-availability flag.

use std::sync::Arc;

use crate::config::Config;
use crate::db::Pool;
use crate::infra::events::Bus;
use crate::infra::external_subtitles::ExternalSubtitles;
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
use kroma_media::hls;

/// Resolves a point name to every module currently contributing it. The core
/// holds only this: it never learns which module answers, or what the point is
/// for.
pub type Contributions =
    std::sync::Arc<dyn Fn(&str) -> Vec<kroma_module_host::Contribution> + Send + Sync>;

/// The ids of installed modules that came from the official catalog. A function
/// for the same reason [`Contributions`] is one: the core is handed opaque
/// strings on demand and never holds a roster of what exists.
pub type OfficialModules = std::sync::Arc<dyn Fn() -> Vec<String> + Send + Sync>;

/// Everything the composition root (the binary) contributes from module crates,
/// bundled so the core roster keeps naming no module type. See [`AppState::new`].
pub struct ModuleWiring {
    pub services: std::collections::HashMap<
        std::any::TypeId,
        std::sync::Arc<dyn std::any::Any + Send + Sync>,
    >,
    pub jobs: &'static [crate::services::jobs::Builtin],
    pub contributions: Contributions,
    pub official_modules: OfficialModules,
}

pub struct AppState {
    pub config: Config,
    pub ffprobe_available: bool,
    pub db: Pool,
    pub settings: Settings,
    pub metadata_cache: Arc<metadata::Cache>,
    pub art_refills: crate::services::art_refill::Inflight,
    pub events: Bus,
    pub activity: activity::Shared,
    pub hls: hls::HlsEngine,
    pub storyboard: Storyboard,
    pub external_subtitles: ExternalSubtitles,
    pub quickconnect: QuickConnect,
    pub handoff: Handoff,
    pub playback: Registry,
    pub cast: crate::services::cast::Registry,
    pub metrics: Metrics,
    pub embedder: crate::point::Point,
    pub network: Arc<crate::services::network::Network>,
    pub search: Arc<SearchEngine>,
    pub vectors: Arc<VectorCache>,
    pub jobs: Arc<JobManager>,
    pub subtitle_gen: Arc<GenRegistry>,
    pub instance_id: String,
    // Signs the media tickets the byte routes accept in a URL. Never served.
    pub media_ticket_key: String,
    // Semaphore for offline-download remuxes; a full gate returns `503`
    // rather than queueing, since a permit is held for the whole transfer.
    pub downloads: Arc<tokio::sync::Semaphore>,
    me: std::sync::Weak<AppState>,
    pub(crate) contributions: Contributions,
    pub(crate) official_modules: OfficialModules,
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
        embedder: crate::point::Point,
        wiring: ModuleWiring,
    ) -> SharedState {
        let ModuleWiring {
            services: module_services,
            jobs: module_jobs,
            contributions,
            official_modules,
        } = wiring;
        let hls = hls::HlsEngine::new(
            config.data_dir.join("hls"),
            crate::services::settings::max_transcodes(&settings),
            crate::services::settings::transcode_cache_limit_bytes(&settings),
        );
        let storyboard = Storyboard::new(&config.data_dir);
        // Mint (or read back) this install's stable identity before anything can
        // serve `/api/health`.
        let instance_id = crate::services::settings::ensure_instance_id(&settings, &db);
        let media_ticket_key = crate::services::media_ticket::signing_key(&settings, &db);
        // Minted here rather than on the statistics job's first run: the settings
        // page shows it and an operator quotes it to have their row erased, so it
        // has to exist from the moment the feature is on rather than an hour later.
        if settings.get_bool(crate::services::stats::ENABLED_KEY, false) {
            crate::services::stats::ensure_identity(&settings, &db);
        }
        let downloads = Arc::new(tokio::sync::Semaphore::new(
            crate::services::settings::max_transcodes(&settings),
        ));
        let services = module_services;
        kroma_media::ffmpeg_gate::set_capacity(crate::services::settings::media_workers(&settings));
        let mut jobs = JobManager::new();
        crate::services::jobs::register_all(&mut jobs);
        for b in module_jobs {
            jobs.register(b);
        }
        jobs.load_schedules(&db);
        jobs.set_pipeline_paused(settings.get_bool("pipelinePaused", false));
        let _ = crate::db::reconcile_running_runs(&db);
        crate::services::pipeline::recover_on_boot(&db);
        let metrics = Metrics::new(db.clone());
        let network = Arc::new(crate::services::network::Network::new(
            db.clone(),
            settings.clone(),
            crate::point::Point::new(crate::services::network::VPN_POINT, contributions.clone()),
        )
        .with_core_ports(config.port, config.https_port_override));
        Arc::new_cyclic(|weak| AppState {
            config,
            ffprobe_available,
            db,
            settings,
            metadata_cache: Arc::new(metadata::Cache::new()),
            art_refills: Default::default(),
            events: Bus::new(),
            activity: activity::new(),
            hls,
            storyboard,
            external_subtitles: ExternalSubtitles::default(),
            quickconnect: quickconnect::new(),
            handoff: handoff::new(),
            playback: Registry::new(),
            cast: crate::services::cast::Registry::new(),
            metrics,
            embedder,
            network,
            search: Arc::new(SearchEngine::new().expect("init search index")),
            vectors: Arc::new(VectorCache::new()),
            jobs: Arc::new(jobs),
            subtitle_gen: Arc::new(GenRegistry::default()),
            instance_id,
            media_ticket_key,
            downloads,
            me: weak.clone(),
            contributions,
            official_modules,
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
                official_modules: Arc::new(Vec::new),
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
