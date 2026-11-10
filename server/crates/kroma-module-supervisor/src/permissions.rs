//! The permissions an installed module declares, as the core's policy asks
//! for them.

use std::sync::Arc;

use kroma_module_manifest::{Listen, Permissions};

use super::Supervisor;

impl Supervisor {
    /// The `permissions` block module `id` declares, or `None` when it declares
    /// none or is not installed.
    pub fn permissions_of(&self, id: &str) -> Option<Permissions> {
        self.installed_manifests()
            .into_iter()
            .find(|manifest| manifest.id == id)?
            .permissions
    }

    /// What the modules `enabled` lets through declare in `net.listen`, read
    /// afresh on every call: the ports no other module may dial on this machine.
    pub fn listeners_of(
        self: &Arc<Self>,
        enabled: impl Fn(&str) -> bool + Send + Sync + 'static,
    ) -> Arc<dyn Fn() -> Vec<Listen> + Send + Sync> {
        let supervisor = Arc::clone(self);
        Arc::new(move || supervisor.declared_listeners(&enabled))
    }

    fn declared_listeners(&self, enabled: &dyn Fn(&str) -> bool) -> Vec<Listen> {
        self.installed_manifests()
            .into_iter()
            .filter(|manifest| enabled(&manifest.id))
            .filter_map(|manifest| manifest.permissions)
            .flat_map(|permissions| permissions.net.listen)
            .collect()
    }
}

#[cfg(test)]
mod tests;
