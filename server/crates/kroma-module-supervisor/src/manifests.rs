//! What is installed on disk: the manifests, their icons, the cached listing,
//! and the storage grant a manifest declares.

use kroma_module_manifest::ModuleManifest;

use super::{Supervisor, MODULE_BIN, STAGING_PREFIX};

impl Supervisor {
    /// What `id` declared under `storage`, or `None` when it declared none -- in
    /// which case it holds no database capability at all.
    ///
    /// Read off disk rather than out of [`installed_manifests`](Self::installed_manifests),
    /// which is cached: this is what a module's grant is built from, and a grant
    /// one version out of date is not a stale listing, it is a module that gets
    /// the wrong answer to every query. One small file, read once per spawn.
    pub(crate) fn storage_of(&self, id: &str) -> Option<kroma_module_manifest::Storage> {
        let text = std::fs::read_to_string(self.dir(id).join("module.json")).ok()?;
        serde_json::from_str::<ModuleManifest>(&text).ok()?.storage
    }

    /// Whether this module ships a sidecar binary at all. A library module (the
    /// scene parser, the download sub-engines) is code co-linked into another
    /// process, so it HAS no process: "not running" is its normal state, not a
    /// fault, and nothing should report it as one.
    pub fn has_binary(&self, id: &str) -> bool {
        self.dir(id).join(MODULE_BIN).exists()
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
    Ok(())
}

/// A module's core-database grant on the wire, as `kroma-db` reads it back.
/// Serialization cannot fail for this shape; an empty grant is the fallback and
/// also the answer for a module that declared no storage.
pub(super) fn grant_json(storage: Option<&kroma_module_manifest::Storage>) -> String {
    storage
        .map(|s| serde_json::json!({ "read": s.core.read, "write": s.core.write }))
        .and_then(|v| serde_json::to_string(&v).ok())
        .unwrap_or_else(|| "{}".to_string())
}

#[cfg(test)]
mod tests {
    use super::super::{Supervisor, SupervisorConfig};
    use super::grant_json;

    #[test]
    fn the_grant_a_module_is_spawned_with_is_the_one_its_manifest_declares() {
        let storage = kroma_module_manifest::Storage {
            core: kroma_module_manifest::CoreScope {
                read: vec!["requests".into(), "users.username".into()],
                write: vec!["wanted".into()],
            },
            adopt: vec!["indexers".into()],
        };
        let json = grant_json(Some(&storage));
        let back: kroma_db::Grant = serde_json::from_str(&json).expect("kroma-db reads it back");
        assert_eq!(back.read, ["requests", "users.username"]);
        assert_eq!(back.write, ["wanted"]);
    }

    #[test]
    fn a_module_that_declared_no_storage_is_spawned_with_an_empty_grant() {
        let json = grant_json(None);
        assert_eq!(
            serde_json::from_str::<kroma_db::Grant>(&json).unwrap(),
            kroma_db::Grant::none()
        );

        let private_only = kroma_module_manifest::Storage::default();
        let json = grant_json(Some(&private_only));
        assert_eq!(
            serde_json::from_str::<kroma_db::Grant>(&json).unwrap(),
            kroma_db::Grant::none()
        );
    }

    #[test]
    fn a_modules_grant_comes_off_disk_even_when_the_listing_cache_is_stale() {
        let dir = kroma_testing::temp_dir("grant-stale-cache");
        let sup = Supervisor::new(SupervisorConfig {
            modules_dir: dir.path().to_path_buf(),
            core_url: "http://127.0.0.1:0".into(),
            host_token: "t".into(),
            db_path: dir.path().join("db.sqlite"),
            data_dir: dir.path().to_path_buf(),
            reserved_ids: Vec::new(),
            server_version: "0.1.4".into(),
            log_line: None,
        });

        let write = |body: &str| {
            let d = dir.path().join("com.example.demo");
            std::fs::create_dir_all(&d).unwrap();
            std::fs::write(d.join("module.json"), body).unwrap();
        };
        let v = kroma_module_manifest::MODULE_SCHEMA_VERSION;

        write(&format!(
            r#"{{ "schemaVersion": {v}, "id": "com.example.demo", "name": "D", "version": "1.0.0" }}"#
        ));
        assert_eq!(sup.installed_manifests().len(), 1);
        assert!(sup.storage_of("com.example.demo").is_none());

        // The cache is deliberately NOT invalidated here: this is the window
        // `install` spawns in.
        write(&format!(
            r#"{{ "schemaVersion": {v}, "id": "com.example.demo", "name": "D", "version": "2.0.0",
                  "storage": {{ "core": {{ "read": ["requests"], "write": ["wanted"] }} }} }}"#
        ));
        assert_eq!(
            sup.installed_manifests()[0].version,
            "1.0.0",
            "the listing is still stale, which is the whole point"
        );

        let storage = sup
            .storage_of("com.example.demo")
            .expect("the grant comes off disk");
        assert_eq!(storage.core.read, ["requests"]);
        assert_eq!(storage.core.write, ["wanted"]);

        // ...and it is what would reach the sidecar.
        let back: kroma_db::Grant = serde_json::from_str(&grant_json(Some(&storage))).unwrap();
        assert_eq!(back.read, ["requests"]);
    }
}
