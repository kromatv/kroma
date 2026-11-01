//! The permissions an installed module declares, as the core's policy asks
//! for them.

use kroma_module_manifest::Permissions;

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
}

#[cfg(test)]
mod tests;
