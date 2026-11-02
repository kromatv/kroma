//! What is installed on disk: the manifests, their icons and the cached listing.

use kroma_module_manifest::ModuleManifest;

use super::{Supervisor, MODULE_COMPONENT, STAGING_PREFIX};

impl Supervisor {
    /// `id`'s manifest as it is on disk, which is what its component starts
    /// from: the storage grant, and the permissions.
    ///
    /// Read off disk rather than out of [`installed_manifests`](Self::installed_manifests),
    /// which is cached: a grant one version out of date is not a stale listing,
    /// it is a module that gets the wrong answer to every query. One small file,
    /// read once per start.
    pub(crate) fn manifest_on_disk(&self, id: &str) -> Option<ModuleManifest> {
        let text = std::fs::read_to_string(self.dir(id).join("module.json")).ok()?;
        serde_json::from_str::<ModuleManifest>(&text).ok()
    }

    /// Whether this module ships a component at all. A library module (the
    /// scene parser, the download sub-engines) is code co-linked into another
    /// component, so it has none of its own: "not running" is its normal state,
    /// not a fault, and nothing should report it as one.
    pub fn has_component(&self, id: &str) -> bool {
        self.dir(id).join(MODULE_COMPONENT).exists()
    }

    /// Every installed module's `module.json`, cached until the next install or
    /// uninstall. One that does not parse is logged with its directory and left
    /// out, so a reader downstream never has to ask whether a field is there.
    pub fn installed_manifests(&self) -> Vec<ModuleManifest> {
        if let Some(cached) = self.manifests_cache.read().unwrap().clone() {
            return cached;
        }
        let scanned = self.scan_manifests();
        *self.manifests_cache.write().unwrap() = Some(scanned.clone());
        scanned
    }

    fn scan_manifests(&self) -> Vec<ModuleManifest> {
        let Ok(entries) = std::fs::read_dir(&self.cfg.modules_dir) else {
            return Vec::new();
        };
        entries
            .filter_map(Result::ok)
            .filter(|e| e.path().is_dir())
            // An install unpacks beside the installed modules, so a listing
            // taken mid-install would otherwise report the staged copy as a
            // second module with the same id.
            .filter(|e| !e.file_name().to_string_lossy().starts_with(STAGING_PREFIX))
            .filter_map(|e| {
                let dir = e.path();
                let text = std::fs::read_to_string(dir.join("module.json")).ok()?;
                match serde_json::from_str::<ModuleManifest>(&text) {
                    Ok(manifest) => Some(manifest),
                    Err(error) => {
                        tracing::warn!(
                            dir = %dir.display(),
                            %error,
                            "module.json is not a manifest; that module is ignored",
                        );
                        None
                    }
                }
            })
            .collect()
    }

    pub(crate) fn invalidate_manifests(&self) {
        *self.manifests_cache.write().unwrap() = None;
        *self.notifications_cache.write().unwrap() = None;
    }

    /// The ids of every runtime-installed (`.kmod`) module — not the ones
    /// compiled into this server.
    pub fn installed_ids(&self) -> Vec<String> {
        self.installed_manifests()
            .into_iter()
            .map(|m| m.id)
            .collect()
    }

    /// A runtime-installed module's packaged icon bytes, svg preferred over png.
    pub fn icon(&self, id: &str) -> Option<(&'static str, Vec<u8>)> {
        super::install::validate_id(id).ok()?;
        let dir = self.dir(id);
        if let Ok(bytes) = std::fs::read(dir.join("icon.svg")) {
            return Some(("image/svg+xml", bytes));
        }
        if let Ok(bytes) = std::fs::read(dir.join("icon.png")) {
            return Some(("image/png", bytes));
        }
        None
    }
}

// Checked at install AND at spawn: an installed module predates the server it
// now runs under, and the fields that moved parse as absent rather than as
// errors, so reading one on a best-effort basis loses its dependencies silently
// instead of saying why.
pub(super) fn check_manifest_schema(id: &str, manifest: &ModuleManifest) -> anyhow::Result<()> {
    let found = manifest.schema_version;
    anyhow::ensure!(
        found == kroma_module_manifest::MODULE_SCHEMA_VERSION,
        "'{id}' was built for manifest schema v{found}, and this server speaks v{}; rebuild it against \
         the current SDK",
        kroma_module_manifest::MODULE_SCHEMA_VERSION,
    );
    if let Some(problem) = manifest.permissions.as_ref().and_then(|p| p.problem()) {
        anyhow::bail!("'{id}' declares a permission this server cannot grant: {problem}");
    }
    if let Some(problem) = manifest.notifications_problem() {
        anyhow::bail!("'{id}' declares a notification type this server cannot send: {problem}");
    }
    Ok(())
}

#[cfg(test)]
mod tests;
