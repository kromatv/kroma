//! The KROMA module SDK: the ONE crate a server module depends on.
//!
//! A module must not depend on `kroma-engine`, `kroma-db`, `kroma-domain` or
//! `kroma-http` directly. This facade re-exports the manifest layer at the crate
//! root (`EmbeddedModule`, `ModuleManifest`, `Registry`, ...) and mirrors the
//! host / engine / domain / http / db / primitives surface under submodules, so a
//! module writes `kroma_module_sdk::engine::state::SharedState` instead of
//! reaching into the core crate.
//!
//! What is NOT here is any description of what a module is for. A module reaches
//! a peer by asking [`host::HostCtx::contributions`] for a point NAME and calling
//! it with JSON both sides declare themselves; there is no trait here for
//! torznab, or downloads, or anything else, because the core cannot enumerate the
//! things modules will do. See docs/module-plugin-model.md.

// Manifest layer (below engine): EmbeddedModule / Module / ModuleManifest /
// Registry / capability + config types. Re-exported at the crate root.
pub use kroma_module_manifest::*;

/// `embedded_module!()` builds a module's `MODULE` const by discovering its
/// `module.json` + `icon.<ext>` at compile time. Write
/// `pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();`.
pub use kroma_module_macros::embedded_module;

/// Host contract: the `ServerModule` trait, `HostCtx`, the point resolvers and
/// the `service` helper, and the `async_trait` re-export module impls need.
pub mod host {
    pub use kroma_module_host::*;
}

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

/// Standing a point's provider up on a real socket, for a test that drives both
/// ends. Re-exported from the host crate, where it lives behind its own feature so
/// a module with no database does not link one to run a round-trip test.
#[cfg(any(test, feature = "testing"))]
pub use kroma_module_host::test_serve as testing;
