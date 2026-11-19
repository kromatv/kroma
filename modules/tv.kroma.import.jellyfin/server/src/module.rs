use kroma_module_sdk::host::{async_trait, HostCtx, ServerModule};
use kroma_module_sdk::EmbeddedModule;

use crate::sign_ins::MIGRATIONS;
use crate::MODULE_ID;

/// This module's registry entry: its manifest and icon, embedded at compile time.
pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();

struct JellyfinImport;

#[async_trait]
impl<S> ServerModule<S> for JellyfinImport
where
    S: HostCtx + Clone + Send + Sync + 'static,
{
    fn id(&self) -> &'static str {
        MODULE_ID
    }

    fn migrations(&self) -> &'static str {
        MIGRATIONS
    }
}

/// What the host starts: the module's own database, and no job or event.
pub fn server_module<S: HostCtx + Clone + Send + Sync + 'static>() -> Box<dyn ServerModule<S>> {
    Box::new(JellyfinImport)
}
