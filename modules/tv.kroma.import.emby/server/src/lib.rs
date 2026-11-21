//! The Emby importer. It answers the core's `importer` point by reading an Emby
//! server with the Jellyfin importer's Emby dialect: the same calls under Emby's
//! paths and authorization scheme.

use kroma_module_sdk::host::{async_trait, HostCtx, HostStorage, ServerModule};
use kroma_module_sdk::EmbeddedModule;

pub const MODULE_ID: &str = "tv.kroma.import.emby";

/// This module's registry entry: its manifest and icon, embedded at compile time.
pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();

struct EmbyImport;

#[async_trait]
impl<S> ServerModule<S> for EmbyImport
where
    S: HostCtx + Clone + Send + Sync + 'static,
{
    fn id(&self) -> &'static str {
        MODULE_ID
    }

    fn migrations(&self) -> &'static str {
        kroma_import_jellyfin::MIGRATIONS
    }
}

/// What the host starts: the module's own database, and no job or event.
pub fn server_module<S: HostCtx + Clone + Send + Sync + 'static>() -> Box<dyn ServerModule<S>> {
    Box::new(EmbyImport)
}

/// The `importer` point as this module answers it, for an Emby server.
pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> axum::Router<S> {
    kroma_import_jellyfin::routes_for(&kroma_import_jellyfin::EMBY)
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::Module;

    use super::*;

    #[test]
    fn the_embedded_manifest_is_this_module_s() {
        let manifest = MODULE.manifest();

        assert_eq!(manifest.id, MODULE_ID);
        assert_eq!(manifest.contributes[0].point, "importer");
    }
}
