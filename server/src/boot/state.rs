//! Assembling the running state: the module supervisor, the one hook the core
//! uses to reach a module, and the `AppState` everything else hangs off.

use std::sync::Arc;

use kroma_config::Config;
use kroma_db as db;
use kroma_engine::services::settings::Settings;
use kroma_engine::{infra, state};
use kroma_module_supervisor::{Supervisor, SupervisorConfig};

use crate::boot::transcriber::TranscriberClient;

/// Build the supervisor and the app state. The state is handed a FUNCTION for
/// reaching modules, never the supervisor and never a module id: which module
/// answers a contract is resolved fresh on every call.
pub fn build(
    config: Config,
    ffprobe_available: bool,
    db: db::Pool,
    settings: Settings,
) -> (state::SharedState, Arc<Supervisor>) {
    // Authenticates the callbacks a module makes back into the core.
    let host_token: String = {
        use rand::RngExt;
        rand::rng().sample_iter(rand::distr::Alphanumeric).take(32).map(char::from).collect()
    };
    let supervisor = Supervisor::new(SupervisorConfig {
        modules_dir: config.data_dir.join("modules"),
        core_url: format!("http://127.0.0.1:{}", config.port),
        host_token,
        db_path: config.db_path(),
        data_dir: config.data_dir.clone(),
        // An in-core backend can't be shadowed by an installed `.kmod` of the
        // same id (two live backends); sidecar-only modules are not reserved.
        reserved_ids: kroma_module_kernel::backend_ids(),
        server_version: env!("CARGO_PKG_VERSION").to_string(),
        log_line: Some(Arc::new(|id: &str, line: &str| {
            println!("[{id}] {line}");
            infra::logbuf::LOG_BUFFER.push_module_line(id, line);
        })),
    });

    let mut services: std::collections::HashMap<
        std::any::TypeId,
        Arc<dyn std::any::Any + Send + Sync>,
    > = std::collections::HashMap::new();
    services.insert(
        std::any::TypeId::of::<Supervisor>(),
        supervisor.clone() as Arc<dyn std::any::Any + Send + Sync>,
    );

    // The ONE thing the core knows about modules: how to reach whoever contributes
    // a named point. Which module that is, or whether one is installed at all, it
    // never learns.
    let contributions: state::Contributions = {
        let supervisor = supervisor.clone();
        Arc::new(move |point: &str| supervisor.contributions(point))
    };

    // Transcription is long-running and rides a DB row for progress, so the core
    // holds a client for it. The embedder needs none: the state builds that point
    // from the same resolver.
    let transcriber =
        Arc::new(TranscriberClient::new(point(&contributions, "transcriber"), db.clone()));
    services.insert(std::any::TypeId::of::<TranscriberClient>(), transcriber);

    // Empty job roster: sidecars register their own jobs over `/_host/register-job`.
    let state = state::AppState::new(
        config,
        ffprobe_available,
        db,
        settings,
        kroma_engine::point::Point::new("embedder", contributions.clone()),
        services,
        &[],
        contributions,
    );
    (state, supervisor)
}

/// A resolver for one point name. It re-asks on every call, so a module installed
/// or restarted later is picked up with nothing re-wired.
fn point(resolve: &state::Contributions, name: &'static str) -> kroma_module_host::Resolver {
    let resolve = resolve.clone();
    Arc::new(move || {
        let found = resolve(name).into_iter().next()?;
        Some((found.base_url, found.token))
    })
}
