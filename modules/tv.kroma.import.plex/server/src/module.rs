use kroma_module_sdk::host::{async_trait, HostStorage, ServerModule};
use kroma_module_sdk::EmbeddedModule;

use crate::{store, MODULE_ID};

/// This module's registry entry: its manifest and icon, embedded at compile time.
pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();

struct PlexImport;

#[async_trait]
impl<S> ServerModule<S> for PlexImport
where
    S: HostStorage + Clone + Send + Sync + 'static,
{
    fn id(&self) -> &'static str {
        MODULE_ID
    }

    fn migrations(&self) -> &'static str {
        store::MIGRATIONS
    }
}

pub fn server_module<S: HostStorage + Clone + Send + Sync + 'static>() -> Box<dyn ServerModule<S>> {
    Box::new(PlexImport)
}
