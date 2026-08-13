//! The module registry: the single server-side composition point for every
//! module (manifest, in-core backend, or runtime-loaded WASM).

use std::sync::{Arc, OnceLock};

use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::{from_fn_with_state, Next};
use axum::response::IntoResponse;
use axum::Router;
use kroma_module_host::{HostCtx, ServerModule};
use kroma_module_manifest::{ModuleManifest, Registry};

use kroma_engine::state::SharedState;

struct ModuleRegistry {
    manifests: Registry,
    servers: Vec<Box<dyn ServerModule<SharedState>>>,
}

fn build() -> ModuleRegistry {
    // Generated from modules/roster.yaml via kroma_modules_generated; nothing
    // here names a specific module.
    let mut manifests = Registry::new();
    kroma_modules_generated::register_all(&mut manifests);
    let servers = kroma_modules_generated::server_modules();

    let ids: Vec<String> = manifests.manifests().into_iter().map(|m| m.id).collect();
    for s in &servers {
        assert!(
            ids.iter().any(|id| id == s.id()),
            "ServerModule {:?} has no matching module manifest",
            s.id(),
        );
    }
    ModuleRegistry { manifests, servers }
}

fn registry() -> &'static ModuleRegistry {
    static REGISTRY: OnceLock<ModuleRegistry> = OnceLock::new();
    REGISTRY.get_or_init(build)
}

fn resolved_order() -> Vec<String> {
    let reg = &registry().manifests;
    match reg.resolve() {
        Ok(order) => order,
        Err(err) => {
            tracing::error!(%err, "module graph did not resolve; using registration order");
            reg.manifests().into_iter().map(|m| m.id).collect()
        }
    }
}

fn compiled_manifests() -> Vec<ModuleManifest> {
    let all = registry().manifests.manifests();
    resolved_order()
        .iter()
        .filter_map(|id| all.iter().find(|m| &m.id == id).cloned())
        .collect()
}

/// Ids of modules with an in-core backend. These collide with a `.kmod` of the
/// same id and so cannot be installed; a manifest-only module is not reserved.
pub fn backend_ids() -> Vec<String> {
    registry().servers.iter().map(|m| m.id().to_string()).collect()
}

fn supervisor(state: &SharedState) -> Option<Arc<kroma_module_supervisor::Supervisor>> {
    kroma_module_host::service::<kroma_module_supervisor::Supervisor>(state)
}

/// Ids of runtime-installed `.kmod` modules; only these can be uninstalled.
pub fn installed_ids(state: &SharedState) -> Vec<String> {
    supervisor(state).map(|s| s.installed_ids()).unwrap_or_default()
}

/// Every module's manifest: the compile-time roster plus installed `.kmod`s,
/// de-duped so a built-in shadows an installed copy of the same id.
pub fn manifests(state: &SharedState) -> Vec<ModuleManifest> {
    let mut all = compiled_manifests();
    if let Some(sup) = supervisor(state) {
        let have: std::collections::HashSet<String> = all.iter().map(|m| m.id.clone()).collect();
        for v in sup.installed_manifests() {
            match serde_json::from_value::<ModuleManifest>(v) {
                Ok(m) if !have.contains(&m.id) => all.push(m),
                Ok(_) => {}
                Err(e) => tracing::warn!(error = %e, "installed module has an invalid module.json"),
            }
        }
    }
    all
}

/// A module's packaged icon bytes (compile-time first, then a runtime-installed
/// `.kmod`'s icon file), for `GET /api/modules/<id>/icon`.
pub fn icon(state: &SharedState, id: &str) -> Option<(&'static str, Vec<u8>)> {
    if let Some(ic) = registry().manifests.icon_of(id) {
        return Some((ic.content_type, ic.bytes.to_vec()));
    }
    supervisor(state).and_then(|s| s.icon(id))
}

/// The backend behavior for a module id, if it has any (for the enable/disable
/// lifecycle driven by the admin toggle).
pub fn find_server(id: &str) -> Option<&'static dyn ServerModule<SharedState>> {
    registry().servers.iter().find(|m| m.id() == id).map(|m| m.as_ref())
}

/// Each module's own schema DDL, in dependency order, applied once at DB init
/// right after the core schema — a module owns its tables without the core
/// crate naming them.
pub fn module_migrations() -> Vec<&'static str> {
    let order = resolved_order();
    let mut servers: Vec<&dyn ServerModule<SharedState>> =
        registry().servers.iter().map(|m| m.as_ref()).collect();
    servers.sort_by_key(|m| order.iter().position(|id| id == m.id()).unwrap_or(usize::MAX));
    servers.iter().map(|m| m.migrations()).filter(|s| !s.is_empty()).collect()
}

/// At boot, bring every enabled module's services up (disabled ones down) in
/// dependency order — e.g. the VPN bridge before the engine that tunnels
/// through it — so enabled state survives a restart.
pub async fn apply_enabled_states(state: &SharedState) {
    let order = resolved_order();
    let host: Arc<dyn HostCtx> = state.clone();
    let mut servers: Vec<&dyn ServerModule<SharedState>> =
        registry().servers.iter().map(|m| m.as_ref()).collect();
    servers.sort_by_key(|m| order.iter().position(|id| id == m.id()).unwrap_or(usize::MAX));
    for module in servers {
        if kroma_engine::modules::module_enabled(&state.settings, module.id()) {
            module.on_enable(host.clone()).await;
        } else {
            module.on_disable(host.clone()).await;
        }
    }
}

/// The admin routers of every backend module, each behind its enabled-gate and
/// nested under `/m/<id>`, merged into one router for the `/api/admin` subtree.
///
/// The mount is the module's id for the same reason the out-of-process proxy
/// uses it: a module declares no paths, so it can neither collide with a core
/// route nor shadow another module, and an in-process module and a sidecar are
/// reachable at the same URL.
pub fn mount_admin(state: SharedState) -> Router<SharedState> {
    let mut router = Router::new();
    for module in &registry().servers {
        // axum rejects route_layer on an empty router, so skip lifecycle-only
        // modules that contribute no routes.
        if let Some(routes) = module.admin_routes(&state) {
            let id = module.id();
            router = router.nest(&format!("/m/{id}"), module_scope(state.clone(), id, routes));
        }
    }
    router
}

fn module_scope(state: SharedState, id: &'static str, router: Router<SharedState>) -> Router<SharedState> {
    router.route_layer(from_fn_with_state(
        state,
        move |State(state): State<SharedState>, req: Request, next: Next| async move {
            if kroma_engine::modules::module_enabled(&state.settings, id) {
                next.run(req).await
            } else {
                StatusCode::NOT_FOUND.into_response()
            }
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn built_in_modules_resolve() {
        // Also exercises build()'s ServerModule<->manifest consistency assertion.
        let order = registry().manifests.resolve().expect("built-in module graph resolves");
        assert!(order.is_empty(), "roster should be empty (zero-module base build): {order:?}");
    }

    #[test]
    fn only_in_core_backends_are_reserved() {
        let reserved = backend_ids();
        assert!(reserved.is_empty(), "no module should be compiled-in: {reserved:?}");
    }

    #[test]
    fn every_server_module_has_a_matching_manifest() {
        for s in &registry().servers {
            assert!(
                compiled_manifests().iter().any(|m| m.id == s.id()),
                "no manifest for ServerModule {:?}",
                s.id(),
            );
        }
    }

    #[test]
    fn find_server_is_none_for_an_unknown_id() {
        assert!(find_server("tv.kroma.does-not-exist").is_none());
        // Every compiled backend (none, in the base build) must be findable.
        for id in backend_ids() {
            assert!(find_server(&id).is_some(), "backend {id:?} not findable");
        }
    }

    #[test]
    fn module_migrations_match_the_compiled_backends() {
        let migs = module_migrations();
        assert!(migs.iter().all(|s| !s.is_empty()));
        assert!(migs.len() <= backend_ids().len());
        assert_eq!(compiled_manifests().len(), registry().manifests.manifests().len());
    }
}

#[cfg(test)]
mod gate_tests {
    //! The enabled-gate around a module's admin routes, driven directly since
    //! the compile-time roster is empty in this build.

    use axum::body::Body;
    use axum::http::{Request as HttpRequest, StatusCode};
    use axum::routing::get;
    use tower::ServiceExt as _;

    use super::*;

    // The guard comes back with the state: the router built from it keeps
    // reading the settings store that lives in that directory.
    fn test_state() -> (SharedState, kroma_testing::TempDir) {
        state_with_services(|_| std::collections::HashMap::new())
    }

    type ModuleServices =
        std::collections::HashMap<std::any::TypeId, Arc<dyn std::any::Any + Send + Sync>>;

    fn state_with_services(
        services: impl FnOnce(&std::path::Path) -> ModuleServices,
    ) -> (SharedState, kroma_testing::TempDir) {
        let dir = kroma_testing::temp_dir("kernel");
        let db = kroma_db::init(&dir.path().join("kroma.db")).unwrap();
        let settings = kroma_engine::services::settings::Settings::load(&db);
        let config = kroma_config::Config {
            host: "127.0.0.1".into(),
            port: 0,
            data_dir: dir.path().to_path_buf(),
            tmdb_language: "en-US".into(),
            ..Default::default()
        };
        let embedder: Arc<dyn kroma_engine::ports::Embedder> =
            Arc::new(kroma_engine::ports::NoopEmbedder);
        let state = kroma_engine::state::AppState::new(
            config,
            false,
            db,
            settings,
            embedder,
            services(dir.path()),
            &[],
            Arc::new(|_| None),
        );
        (state, dir)
    }

    fn gated(state: SharedState, id: &'static str) -> Router {
        module_scope(state.clone(), id, Router::new().route("/probe", get(|| async { "ok" })))
            .with_state(state)
    }

    async fn status(router: Router, path: &str) -> StatusCode {
        router
            .oneshot(HttpRequest::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap()
            .status()
    }

    #[tokio::test]
    async fn a_modules_admin_routes_answer_while_it_is_enabled() {
        // Default-enabled: a module nobody toggled is on.
        let (state, _dir) = test_state();
        assert_eq!(status(gated(state, "tv.kroma.indexer"), "/probe").await, StatusCode::OK);
    }

    #[tokio::test]
    async fn a_disabled_modules_admin_routes_are_not_reachable() {
        let (state, _dir) = test_state();
        kroma_engine::modules::set_module_enabled(
            &state.settings,
            &state.db,
            "tv.kroma.indexer",
            false,
        );
        assert_eq!(status(gated(state, "tv.kroma.indexer"), "/probe").await, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn the_gate_reads_the_live_setting_rather_than_a_boot_snapshot() {
        let (state, _dir) = test_state();
        let router = gated(state.clone(), "tv.kroma.vpn");
        assert_eq!(status(router.clone(), "/probe").await, StatusCode::OK);

        kroma_engine::modules::set_module_enabled(&state.settings, &state.db, "tv.kroma.vpn", false);
        assert_eq!(status(router.clone(), "/probe").await, StatusCode::NOT_FOUND);

        kroma_engine::modules::set_module_enabled(&state.settings, &state.db, "tv.kroma.vpn", true);
        assert_eq!(status(router, "/probe").await, StatusCode::OK);
    }

    #[tokio::test]
    async fn an_unrelated_path_404s_whether_the_module_is_on_or_off() {
        // Does not pin `route_layer` over `layer`: both answer 404 here since
        // the middleware has no side effect to observe on an unmatched path.
        let (state, _dir) = test_state();
        assert_eq!(
            status(gated(state.clone(), "tv.kroma.indexer"), "/not-a-route").await,
            StatusCode::NOT_FOUND
        );

        kroma_engine::modules::set_module_enabled(
            &state.settings,
            &state.db,
            "tv.kroma.indexer",
            false,
        );
        assert_eq!(
            status(gated(state, "tv.kroma.indexer"), "/not-a-route").await,
            StatusCode::NOT_FOUND
        );
    }

    #[tokio::test]
    async fn one_modules_gate_does_not_close_anothers_routes() {
        let (state, _dir) = test_state();
        kroma_engine::modules::set_module_enabled(&state.settings, &state.db, "tv.kroma.vpn", false);

        let merged = Router::new()
            .merge(module_scope(
                state.clone(),
                "tv.kroma.vpn",
                Router::new().route("/vpn", get(|| async { "vpn" })),
            ))
            .merge(module_scope(
                state.clone(),
                "tv.kroma.indexer",
                Router::new().route("/indexer", get(|| async { "indexer" })),
            ))
            .with_state(state);

        assert_eq!(status(merged.clone(), "/vpn").await, StatusCode::NOT_FOUND);
        assert_eq!(status(merged, "/indexer").await, StatusCode::OK);
    }

    #[tokio::test]
    async fn a_zero_module_build_mounts_and_migrates_nothing() {
        let (state, _dir) = test_state();
        assert!(module_migrations().is_empty());
        assert!(compiled_manifests().is_empty());
        assert!(manifests(&state).is_empty(), "no supervisor, so nothing installed either");
        assert!(installed_ids(&state).is_empty());
        assert!(icon(&state, "tv.kroma.indexer").is_none());
        assert!(find_server("tv.kroma.indexer").is_none());
        apply_enabled_states(&state).await;
    }

    fn install_module(modules_dir: &std::path::Path, id: &str, module_json: &str) {
        let dir = modules_dir.join(id);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("module.json"), module_json).unwrap();
    }

    fn state_with_installed_modules() -> (SharedState, kroma_testing::TempDir) {
        state_with_services(|data_dir| {
            let modules_dir = data_dir.join("modules");
            install_module(
                &modules_dir,
                "tv.kroma.notes",
                r#"{ "id": "tv.kroma.notes", "name": "Notes", "version": "1.2.3" }"#,
            );
            install_module(&modules_dir, "tv.kroma.broken", r#"{ "name": "no id, no version" }"#);
            std::fs::write(modules_dir.join("tv.kroma.notes").join("icon.svg"), b"<svg/>").unwrap();

            let supervisor =
                kroma_module_supervisor::Supervisor::new(kroma_module_supervisor::SupervisorConfig {
                    modules_dir,
                    core_url: "http://127.0.0.1:0".into(),
                    host_token: "token".into(),
                    db_path: data_dir.join("kroma.db"),
                    data_dir: data_dir.to_path_buf(),
                    reserved_ids: Vec::new(),
                    server_version: "0.0.0".into(),
                    log_line: None,
                });
            std::collections::HashMap::from([(
                std::any::TypeId::of::<kroma_module_supervisor::Supervisor>(),
                supervisor as Arc<dyn std::any::Any + Send + Sync>,
            )])
        })
    }

    #[test]
    fn an_installed_kmod_joins_the_manifest_list() {
        let (state, _dir) = state_with_installed_modules();
        let listed = manifests(&state);
        assert_eq!(listed.len(), 1, "only the readable manifest is listed: {listed:?}");
        assert_eq!(listed[0].id, "tv.kroma.notes");
        assert_eq!(listed[0].version, "1.2.3");
        assert_eq!(installed_ids(&state), vec!["tv.kroma.notes".to_string()]);
    }

    #[test]
    fn a_module_json_that_is_not_a_manifest_is_skipped_rather_than_blanking_the_list() {
        let (state, _dir) = state_with_installed_modules();
        assert!(!manifests(&state).iter().any(|m| m.id == "tv.kroma.broken"));
    }

    #[test]
    fn an_installed_modules_icon_is_served_from_its_directory() {
        let (state, _dir) = state_with_installed_modules();
        let (content_type, bytes) = icon(&state, "tv.kroma.notes").expect("the installed icon");
        assert_eq!(content_type, "image/svg+xml");
        assert_eq!(bytes, b"<svg/>");
        assert!(icon(&state, "tv.kroma.absent").is_none());
    }
}
