//! Assembling the running state: the module supervisor, the one hook the core
//! uses to reach a module, and the `AppState` everything else hangs off.

use std::sync::Arc;

use kroma_config::Config;
use kroma_db as db;
use kroma_engine::services::settings::Settings;
use kroma_engine::{infra, state};
use kroma_module_supervisor::{Supervisor, SupervisorConfig};

use crate::api;
use crate::boot::embedder::EmbedderClient;

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

    // The ONE thing the core knows about modules: how to reach whoever serves a
    // named contract. Which module that is, or whether one is installed at all,
    // it never learns.
    let port_endpoint: state::PortEndpoint = {
        let supervisor = supervisor.clone();
        Arc::new(move |port: &str| supervisor.port_endpoint(port))
    };

    // The core's own two consumers name a CONTRACT, never a provider.
    let whisper =
        Arc::new(api::online_subs::WhisperClient::new(contract(&port_endpoint, "whisper"), db.clone()));
    services.insert(std::any::TypeId::of::<api::online_subs::WhisperClient>(), whisper);
    let embedder: Arc<dyn kroma_engine::ports::Embedder> =
        Arc::new(EmbedderClient::new(contract(&port_endpoint, "embedder")));

    // Empty job roster: sidecars register their own jobs over `/_host/register-job`.
    let state = state::AppState::new(
        config,
        ffprobe_available,
        db,
        settings,
        embedder,
        services,
        &[],
        port_endpoint,
    );
    (state, supervisor)
}

/// A resolver pinned to one contract name. It re-asks on every call, so a
/// provider installed or restarted later is picked up with nothing re-wired.
fn contract(endpoint: &state::PortEndpoint, port: &'static str) -> kroma_module_host::Resolver {
    let endpoint = endpoint.clone();
    Arc::new(move || endpoint(port))
}
