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
        rand::rng()
            .sample_iter(rand::distr::Alphanumeric)
            .take(32)
            .map(char::from)
            .collect()
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

    // The first of the two things the core knows about modules: how to reach
    // whoever contributes a named point. Which module that is, or whether one is
    // installed at all, it never learns.
    let contributions: state::Contributions = {
        let supervisor = supervisor.clone();
        Arc::new(move |point: &str| supervisor.contributions(point))
    };

    // And the second: which installed modules came from the official catalog, so
    // the opt-in statistics can name them without a third-party id ever leaving
    // the box. Still a function, still no roster.
    let official_modules: state::OfficialModules = {
        let supervisor = supervisor.clone();
        Arc::new(move || {
            supervisor
                .installed_ids()
                .into_iter()
                .filter(|id| official_origin(&supervisor.origin(id)))
                .collect()
        })
    };

    // Transcription is long-running and rides a DB row for progress, so the core
    // holds a client for it. The embedder needs none: the state builds that point
    // from the same resolver.
    let transcriber = Arc::new(TranscriberClient::new(
        point(&contributions, "transcriber"),
        db.clone(),
    ));
    services.insert(std::any::TypeId::of::<TranscriberClient>(), transcriber);

    // Empty job roster: sidecars register their own jobs over `/_host/register-job`.
    let state = state::AppState::new(
        config,
        ffprobe_available,
        db,
        settings,
        kroma_engine::point::Point::new("embedder", contributions.clone()),
        kroma_engine::state::ModuleWiring {
            services,
            jobs: &[],
            contributions,
            official_modules,
        },
    );
    (state, supervisor)
}

const OFFICIAL_CATALOG_HOST: &str = "modules.kroma.tv";

fn official_origin(origin: &kroma_module_supervisor::Origin) -> bool {
    origin.kind == "registry"
        && origin
            .url
            .as_deref()
            .is_some_and(|url| host_of(url) == Some(OFFICIAL_CATALOG_HOST))
}

fn host_of(url: &str) -> Option<&str> {
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))?;
    let host = rest.split(['/', ':', '?', '#']).next()?;
    (!host.is_empty()).then_some(host)
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

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_module_supervisor::Origin;

    fn origin(kind: &str, url: Option<&str>) -> Origin {
        Origin {
            kind: kind.to_string(),
            url: url.map(str::to_string),
            installed_at: 0,
            bin: None,
            local_build: false,
        }
    }

    #[test]
    fn only_a_module_the_official_catalog_served_counts_as_official() {
        assert!(official_origin(&origin(
            "registry",
            Some("https://modules.kroma.tv/registry.json")
        )));
        assert!(!official_origin(&origin(
            "registry",
            Some("https://modules.example.com/registry.json")
        )));
        assert!(!official_origin(&origin("upload", None)));
        assert!(!official_origin(&origin(
            "url",
            Some("https://example.com/a.kmod")
        )));
        assert!(!official_origin(&origin("registry", None)));
    }

    #[test]
    fn a_lookalike_host_is_not_the_official_one() {
        assert!(!official_origin(&origin(
            "registry",
            Some("https://modules.kroma.tv.evil.example/registry.json")
        )));
        assert!(!official_origin(&origin(
            "registry",
            Some("https://evil.example/?modules.kroma.tv")
        )));
    }

    #[test]
    fn a_host_is_read_out_of_a_url_and_only_out_of_a_url() {
        assert_eq!(
            host_of("https://modules.kroma.tv/a/b"),
            Some("modules.kroma.tv")
        );
        assert_eq!(host_of("http://127.0.0.1:8787/v1"), Some("127.0.0.1"));
        assert_eq!(host_of("modules.kroma.tv/registry.json"), None);
        assert_eq!(host_of("https://"), None);
    }
}
