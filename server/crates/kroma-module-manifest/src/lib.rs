//! The KROMA server module contract: a module describes itself and declares
//! what it needs and provides. [`Registry`] resolves the dependency graph;
//! [`ModuleManifest`]/[`Capability`] is the wire shape the frontend `@kroma/module-sdk` mirrors.

mod compat;
mod embedded;
mod event;
mod manifest;
mod registry;

pub use embedded::EmbeddedModule;
/// `embedded_module!()` builds a module's `MODULE` const from the `module.json`
/// and `icon.<ext>` beside it. Re-exported here (as well as from
/// `kroma_module_sdk`) so the capability-provider modules that sit below the SDK
/// facade (e.g. scene) can use it without depending on the facade.
pub use kroma_module_macros::embedded_module;
pub use event::ModuleEvent;
pub use manifest::{
    Capability, CapabilityReq, ConfigField, CoreScope, Dependency, FeRemote, ModuleManifest,
    Storage, Version,
};
pub use compat::{engines_satisfied, is_newer, range_matches, version_satisfies, KNOWN_ENGINES};
pub use manifest::MODULE_SCHEMA_VERSION;
pub use registry::{ModuleRegistration, Registry, ResolveError};

/// A module's packaged icon: an `icon.svg` / `icon.png` sitting next to the
/// module's `module.json`, embedded at build time via `include_bytes!` and
/// served at `GET /api/modules/<id>/icon`.
pub struct ModuleIcon {
    pub content_type: &'static str,
    pub bytes: &'static [u8],
}

/// A server module.
///
/// The host gathers every module into a [`Registry`], resolves the graph, then
/// serves the manifests. Implementors return a static self-description from
/// [`manifest`](Module::manifest) and record the capabilities they provide in
/// [`register`](Module::register).
pub trait Module: Send + Sync {
    // Static self-description: id, version, and declared dependencies.
    //
    // The `provides` field is filled in by the registry from
    // [`register`](Module::register); implementors may leave it empty.
    fn manifest(&self) -> ModuleManifest;

    // Record the capabilities this module contributes. Called once at startup
    // with a fresh [`ModuleRegistration`]. The default registers nothing.
    fn register(&self, _reg: &mut ModuleRegistration) {}

    // The module's packaged icon (`icon.svg` / `icon.png` next to its
    // `module.json`), embedded at build time. Default: none.
    fn icon(&self) -> Option<ModuleIcon> {
        None
    }
}
