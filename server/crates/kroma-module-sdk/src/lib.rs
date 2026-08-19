//! The KROMA module SDK: the ONE crate a server module depends on.
//!
//! A module must not depend on `kroma-engine`, `kroma-db`, `kroma-domain`,
//! `kroma-http`, etc. directly. This facade re-exports the manifest layer at the
//! crate root (`EmbeddedModule`, `ModuleManifest`, `Registry`, ...) and mirrors
//! the host / engine / domain / http / db / primitives / ports surface under
//! submodules, so a module writes `kroma_module_sdk::engine::state::SharedState`
//! instead of reaching into the core crate. Cross-module capabilities go through
//! `kroma_module_sdk::ports` (runtime-resolved traits), never a direct dependency
//! on another module's crate.

// Manifest layer (below engine): EmbeddedModule / Module / ModuleManifest /
// Registry / capability + config types. Re-exported at the crate root.
pub use kroma_module_manifest::*;

/// `embedded_module!()` builds a module's `MODULE` const by discovering its
/// `module.json` + `icon.<ext>` at compile time. Write
/// `pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();`.
pub use kroma_module_macros::embedded_module;

/// Host contract: the `ServerModule` trait, `HostCtx`, `service` / `resolve_port`
/// helpers, and the `async_trait` re-export module impls need.
pub mod host {
    pub use kroma_module_host::*;
}

/// Cross-module capability ports + their shared contract types (runtime-resolved
/// traits), e.g. `VpnProxyPort`, `DownloadClientHost`, `TorznabPort`. A module
/// depends on these instead of another module's crate.
pub mod ports;

/// The application surface: `state::SharedState`, `services::*`, `model::*`.
/// Behind the `engine` feature: this is the whole core, and only the two modules
/// that orchestrate it (acquisition, torrents) have any use for it.
#[cfg(feature = "engine")]
pub mod engine {
    pub use kroma_engine::*;
}

/// Domain types: permissions and the shared DTOs.
pub mod domain {
    pub use kroma_domain::*;
}

/// The outbound HTTP client (`Fetch`, `Response`).
pub mod http {
    pub use kroma_http::*;
}

/// Direct SQLite access. Behind the `storage` feature, which a module turns on
/// when its `module.json` declares `storage`; the pools themselves come from
/// `host::HostStorage`, not from here.
#[cfg(feature = "storage")]
pub mod db {
    pub use kroma_db::*;
}

/// Small shared primitives (`now_ms`, ...).
pub mod primitives {
    pub use kroma_primitives::*;
}

/// The scene module's pure release-name parser / scorer (`parse_release_name`,
/// `ParsedRelease`, `score`, `classify`, ...). Re-exported so consumer modules
/// use `kroma_module_sdk::scene::*` instead of depending on kroma-scene directly.
pub mod scene {
    pub use kroma_scene::*;
}

/// Test helpers for port contracts. A port is reached over HTTP now, so a test
/// that needs a fake provider SERVES one rather than injecting a trait object.
#[cfg(any(test, feature = "testing"))]
pub mod testing {
    use std::sync::Arc;

    use axum::Router;
    use kroma_module_host::Resolver;

    /// Serve a provider's port routes on an ephemeral localhost port and hand
    /// back a [`Resolver`] pointing at it, so a port's two ends can be tested
    /// against each other over the real wire.
    pub async fn serve<S: Clone + Send + Sync + 'static>(
        router: Router<S>,
        state: S,
    ) -> Resolver {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = router.with_state(state);
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        let base = format!("http://{addr}");
        Arc::new(move || Some((base.clone(), "test-token".to_string())))
    }

    pub async fn blocking<T: Send + 'static>(job: impl FnOnce() -> T + Send + 'static) -> T {
        tokio::task::spawn_blocking(job).await.unwrap()
    }
}
