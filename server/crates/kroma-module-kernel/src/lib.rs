//! The module registry: the single server-side composition point for every
//! module, of every tier.
//!
//! A module has up to three facets:
//!  - its **manifest** (id / capabilities / icon / dependency graph) -- the
//!    portable `kroma_module_manifest::Module`, which every compile-time module exports
//!    as a `MODULE` const;
//!  - optionally its **backend behavior** ([`kroma_module_host::ServerModule`]):
//!    the admin routes it serves (behind an enabled-gate) and its async
//!    enable/disable lifecycle. This now lives in each module's OWN crate; the
//!    binary only lists the modules (the composition root) and drives them
//!    generically, so the core is not aware of any specific module;
//!  - or it is **runtime-loaded** (a WASM module in the [`WasmHost`]).
//!
//! [`build`] pulls the compile-time roster from the generated
//! `kroma_modules_generated` aggregator (itself expanded from `modules/roster.yaml`),
//! asserts every behavior has a manifest, and the public functions merge in the
//! WASM tier. The whole server reads modules through this one API; per-module
//! enabled/config state lives in `kroma_engine::modules` (the settings blob).

use std::sync::{Arc, OnceLock};

use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::{from_fn_with_state, Next};
use axum::response::IntoResponse;
use axum::Router;
use kroma_module_host::{HostCtx, ServerModule};
use kroma_module_manifest::{ModuleManifest, Registry};

use kroma_engine::state::SharedState;

/// The compile-time module set: manifests (+ dependency graph) paired with the
/// backend behaviors the ones that have them provide (`ServerModule`s collected
/// from each module's crate).
struct ModuleRegistry {
    manifests: Registry,
    servers: Vec<Box<dyn ServerModule<SharedState>>>,
}

/// Build (once) the compile-time registry from the generated roster. The
/// assertion catches a behavior whose id drifts from any manifest.
fn build() -> ModuleRegistry {
    // The whole compile-time roster (manifests + backend behaviors) is generated
    // from `modules/roster.yaml` (+ the single-file `*.module.md` modules) into
    // `kroma_modules_generated`. The kernel names NO module here: it only drives
    // the generated set generically, so nothing in server/crates hardcodes the
    // module list.
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

/// Compile-time module ids in dependency (initialization) order, or registration
/// order (logged) if the graph fails to resolve.
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

/// Compile-time module manifests in dependency (initialization) order. Falls back
/// to registration order (logged) if the graph fails to resolve, so a broken
/// dependency can never take the listing endpoint down.
fn compiled_manifests() -> Vec<ModuleManifest> {
    let all = registry().manifests.manifests();
    resolved_order()
        .iter()
        .filter_map(|id| all.iter().find(|m| &m.id == id).cloned())
        .collect()
}

/// The ids of modules that ship an in-core backend (a compiled `ServerModule`).
/// These -- and only these -- collide with an installed `.kmod` of the same id
/// (two live backends for one id), so the store rejects installing them. A
/// module that is only manifest-registered in-core (its backend IS a sidecar,
/// e.g. whisper / vector, resolved via the supervisor) is NOT reserved: its
/// `.kmod` MUST be installable for it to work.
pub fn backend_ids() -> Vec<String> {
    registry().servers.iter().map(|m| m.id().to_string()).collect()
}

/// Resolve the module supervisor from the host service registry (registered by
/// the composition root). `None` in contexts without it (e.g. a unit test state).
fn supervisor(state: &SharedState) -> Option<Arc<kroma_module_supervisor::Supervisor>> {
    kroma_module_host::service::<kroma_module_supervisor::Supervisor>(state)
}

/// The ids of the runtime-installed `.kmod` modules (from the supervisor). These
/// are the ones the admin can uninstall; compile-time modules can't.
pub fn installed_ids(state: &SharedState) -> Vec<String> {
    supervisor(state).map(|s| s.installed_ids()).unwrap_or_default()
}

/// Every module's manifest for the listing endpoints: the compile-time roster
/// (dependency ordered) plus the runtime-installed `.kmod` modules (from the
/// supervisor), de-duped by id so a built-in shadows an installed copy of the
/// same id. Used by `/api/modules` and the admin list -- the one merge point.
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

/// Each compile-time module's own schema (the DDL it owns via
/// [`ServerModule::migrations`]), in dependency (resolved) order, skipping the
/// modules that declare none. The binary applies these once at DB init, right
/// after the core schema, so a module owns its own tables without the core crate
/// naming them.
pub fn module_migrations() -> Vec<&'static str> {
    let order = resolved_order();
    let mut servers: Vec<&dyn ServerModule<SharedState>> =
        registry().servers.iter().map(|m| m.as_ref()).collect();
    servers.sort_by_key(|m| order.iter().position(|id| id == m.id()).unwrap_or(usize::MAX));
    servers.iter().map(|m| m.migrations()).filter(|s| !s.is_empty()).collect()
}

/// At boot, bring every enabled module's live services up (and make sure disabled
/// ones are down), in dependency order, awaiting each so ordering holds (the VPN
/// bridge starts before the engine that tunnels through it). This is the generic
/// mirror of the per-toggle `on_enable`/`on_disable` the admin console runs, so a
/// module's enabled state is durable across a restart instead of the binary
/// hardcoding which module to start.
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

/// The admin routers of every backend module, each behind its enabled-gate,
/// merged into one router for the `/api/admin` subtree.
pub fn mount_admin(state: SharedState) -> Router<SharedState> {
    let mut router = Router::new();
    for module in &registry().servers {
        // Lifecycle-only modules (the engines) contribute no routes; skip them so
        // we never wrap an empty router in a route_layer (which axum rejects).
        if let Some(routes) = module.admin_routes(&state) {
            router = router.merge(module_scope(state.clone(), module.id(), routes));
        }
    }
    router
}

/// Wrap a router so every request to it 404s while `id` is disabled. Uses
/// `route_layer`, so it only guards the module's own routes (an unrelated 404
/// still falls through normally). Needs the resolved `state` (like the session
/// guard) because the enabled flag is read from the live settings store.
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
        // Also runs build()'s ServerModule<->manifest consistency assertion. The
        // roster is EMPTY now (zero-module base build): every first-party module
        // ships only as an installable `.kmod`, so the compiled graph resolves to
        // no modules and every module is uninstallable at runtime.
        let order = registry().manifests.resolve().expect("built-in module graph resolves");
        assert!(order.is_empty(), "roster should be empty (zero-module base build): {order:?}");
    }

    #[test]
    fn only_in_core_backends_are_reserved() {
        // reserved_ids come from backend_ids() (compiled ServerModules). With the
        // zero-module roster NOTHING is reserved: every module's `.kmod` (incl.
        // remote) must be installable, or it could never be managed at runtime.
        let reserved = backend_ids();
        assert!(reserved.is_empty(), "no module should be compiled-in: {reserved:?}");
    }

    #[test]
    fn every_server_module_has_a_matching_manifest() {
        // find_server ids must all be resolvable manifests.
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
        // Each migration string is non-empty and there is at most one per backend.
        let migs = module_migrations();
        assert!(migs.iter().all(|s| !s.is_empty()));
        assert!(migs.len() <= backend_ids().len());
        // compiled_manifests is dependency-ordered and never longer than the roster.
        assert_eq!(compiled_manifests().len(), registry().manifests.manifests().len());
    }
}

#[cfg(test)]
mod gate_tests {
    //! The enabled-gate around a module's admin routes.
    //!
    //! The compile-time roster is empty in this build, so `mount_admin` has no
    //! module to wrap - but the gate itself is what enforces "a disabled module's
    //! admin API is not reachable", and it can be driven directly.

    use axum::body::Body;
    use axum::http::{Request as HttpRequest, StatusCode};
    use axum::routing::get;
    use tower::ServiceExt as _;

    use super::*;

    fn test_state() -> SharedState {
        static SEQ: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("kroma-kernel-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = kroma_db::init(&dir.join("kroma.db")).unwrap();
        let settings = kroma_engine::services::settings::Settings::load(&db);
        let config = kroma_config::Config {
            host: "127.0.0.1".into(),
            port: 0,
            data_dir: dir,
            tmdb_language: "en-US".into(),
            ..Default::default()
        };
        let embedder: Arc<dyn kroma_engine::ports::Embedder> =
            Arc::new(kroma_engine::ports::NoopEmbedder);
        kroma_engine::state::AppState::new(
            config,
            false,
            db,
            settings,
            embedder,
            std::collections::HashMap::new(),
            &[],
        )
    }

    /// A router with one route, wrapped by the gate for module `id`.
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
        let state = test_state();
        assert_eq!(status(gated(state, "tv.kroma.indexer"), "/probe").await, StatusCode::OK);
    }

    #[tokio::test]
    async fn a_disabled_modules_admin_routes_are_not_reachable() {
        // The whole point of the gate: turning a module off in the admin console
        // has to take its API away too, not just hide the UI that calls it.
        let state = test_state();
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
        // The router is built once at boot; toggling a module must take effect
        // without a restart, which is why the middleware reads settings per
        // request instead of capturing a bool.
        let state = test_state();
        let router = gated(state.clone(), "tv.kroma.vpn");
        assert_eq!(status(router.clone(), "/probe").await, StatusCode::OK);

        kroma_engine::modules::set_module_enabled(&state.settings, &state.db, "tv.kroma.vpn", false);
        assert_eq!(status(router.clone(), "/probe").await, StatusCode::NOT_FOUND);

        kroma_engine::modules::set_module_enabled(&state.settings, &state.db, "tv.kroma.vpn", true);
        assert_eq!(status(router, "/probe").await, StatusCode::OK);
    }

    #[tokio::test]
    async fn an_unrelated_path_404s_whether_the_module_is_on_or_off() {
        // A path this module does not serve is a plain 404 either way - the gate
        // must not turn it into a 500 or a hang.
        //
        // Note this does NOT pin `route_layer` over `layer`: with the module
        // disabled both answer 404, so the status cannot tell them apart. The
        // distinction is that `route_layer` skips the middleware entirely for
        // unmatched paths, and this middleware has no side effect to observe.
        let state = test_state();
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
        let state = test_state();
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
        // Every first-party module ships as an installable .kmod, so the compiled
        // roster is empty. These have to be empty rather than panicking.
        let state = test_state();
        assert!(module_migrations().is_empty());
        assert!(compiled_manifests().is_empty());
        assert!(manifests(&state).is_empty(), "no supervisor, so nothing installed either");
        assert!(installed_ids(&state).is_empty());
        assert!(icon(&state, "tv.kroma.indexer").is_none());
        assert!(find_server("tv.kroma.indexer").is_none());
        // ...and bringing the (empty) set up is a no-op that completes.
        apply_enabled_states(&state).await;
    }
}
