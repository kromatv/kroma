//! The install pipeline: staging a `.kmod` beside the module it replaces,
//! validating what the archive carries, and swapping it in.

use std::path::Path;

use kroma_module_manifest::{ModuleManifest, Permissions};

use super::lifecycle::native_build;
use super::{check_manifest_schema, Accept, AsksForMore, Supervisor, NATIVE_BINARY, STAGING_PREFIX};

mod bundle;

use bundle::{decompressed_tar, unpack_validated};

impl Supervisor {
    fn staged_manifest(
        &self,
        staging: &Path,
        expected_id: Option<&str>,
    ) -> anyhow::Result<(String, ModuleManifest)> {
        let manifest: ModuleManifest =
            serde_json::from_str(&std::fs::read_to_string(staging.join("module.json"))?)?;
        let id = manifest.id.clone();
        validate_id(&id)?;
        if let Some(expected) = expected_id {
            if expected != id {
                anyhow::bail!(
                    "bundle declares id '{id}' but it was offered as '{expected}'; refusing to install"
                );
            }
        }
        if self.cfg.reserved_ids.iter().any(|r| r == &id) {
            anyhow::bail!(
                "'{id}' is built into this server and can't be installed as a module (this build compiles it in)"
            );
        }
        // After the id checks, which are the security ones: a bundle shipped
        // under someone else's id must be reported as that, whatever contract it
        // was built against.
        if staging.join(NATIVE_BINARY).exists() {
            return Err(native_build(&id));
        }
        check_manifest_schema(&id, &manifest)?;
        kroma_module_manifest::engines_satisfied(&manifest.engines, &self.cfg.server_version)
            .map_err(|reason| anyhow::anyhow!("'{id}' {reason}"))?;
        Ok((id, manifest))
    }

    /// Unpack a `.kmod` bundle under `<data>/installed/<id>/` and spawn it,
    /// returning the module's manifest JSON. The module's own data in
    /// `<modules_dir>/<id>/` is left as it is.
    ///
    /// `expected_id` must be set whenever the bundle was chosen through a
    /// catalog: the id inside the bundle decides which directory is REPLACED,
    /// so without this a registry could advertise one id and ship a bundle that
    /// overwrites another, including a module the official registry owns.
    ///
    /// `origin` is `(kind, url)` where kind is `registry` / `upload` / `url`,
    /// recorded beside the module so the admin page can show where it came from.
    pub fn install(
        &self,
        bytes: &[u8],
        expected_id: Option<&str>,
        origin: crate::Source<'_>,
    ) -> anyhow::Result<ModuleManifest> {
        let tar_bytes = decompressed_tar(bytes)?;

        let staging = self.staging_dir();
        std::fs::create_dir_all(&staging)?;
        let result = (|| {
            unpack_validated(&tar_bytes, &staging)?;
            let (id, manifest) = self.staged_manifest(&staging, expected_id)?;
            self.check_accepted(&id, &manifest, origin.accept)?;
            self.stop(&id);
            let dest = self.installed_dir(&id);
            let _ = std::fs::remove_dir_all(&dest);
            std::fs::rename(&staging, &dest)?;
            // Before `spawn` below, which reads the manifest again to build the
            // module's storage grant: from the cache it would build the grant
            // the PREVIOUS version declared.
            self.invalidate_manifests();
            self.write_origin(&id, origin)?;
            if self.has_component(&id) {
                self.spawn(&id)?;
            } else {
                // A library module is a leaf crate co-linked into the components
                // that need it, so it has none of its own to start.
                tracing::info!(module = %id, "library module installed (no component to start)");
            }
            Ok::<ModuleManifest, anyhow::Error>(manifest)
        })();
        let _ = std::fs::remove_dir_all(&staging);
        self.invalidate_manifests();
        result
    }

    /// What a `.kmod` declares, without installing it. Refused for the same
    /// reasons an install would be.
    pub fn inspect(&self, bytes: &[u8]) -> anyhow::Result<ModuleManifest> {
        let tar_bytes = decompressed_tar(bytes)?;
        let staging = self.staging_dir();
        std::fs::create_dir_all(&staging)?;
        let read = unpack_validated(&tar_bytes, &staging)
            .and_then(|()| self.staged_manifest(&staging, None));
        let _ = std::fs::remove_dir_all(&staging);
        read.map(|(_, manifest)| manifest)
    }

    fn check_accepted(
        &self,
        id: &str,
        manifest: &ModuleManifest,
        accept: Accept<'_>,
    ) -> anyhow::Result<()> {
        match accept {
            Accept::Anything => Ok(()),
            Accept::Exactly(declared) => says_what_its_row_showed(id, manifest, declared),
            Accept::NoWider(declared) => {
                if let Some(declared) = declared {
                    says_what_its_row_showed(id, manifest, declared)?;
                }
                let installed = self.installed_manifests().into_iter().find(|m| m.id == id);
                match installed {
                    Some(installed) if manifest.asks_more_than(&installed) => {
                        Err(AsksForMore { id: id.to_string() }.into())
                    }
                    _ => Ok(()),
                }
            }
        }
    }

    /// Stop `id` and delete it: its own data first, then what the host installed.
    pub fn uninstall(&self, id: &str) -> anyhow::Result<()> {
        validate_id(id)?;
        self.stop(id);
        self.run.forget_module(id);
        remove_if_present(&self.own_dir(id))?;
        #[cfg(unix)]
        remove_if_present(&self.databases_dir(id))?;
        std::fs::remove_dir_all(self.installed_dir(id))?;
        self.invalidate_manifests();
        Ok(())
    }

    fn staging_dir(&self) -> std::path::PathBuf {
        self.installed_root()
            .join(format!("{STAGING_PREFIX}{}", rand::random::<u32>()))
    }
}

fn remove_if_present(dir: &std::path::Path) -> std::io::Result<()> {
    match std::fs::remove_dir_all(dir) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

fn says_what_its_row_showed(
    id: &str,
    manifest: &ModuleManifest,
    declared: &Permissions,
) -> anyhow::Result<()> {
    if manifest.permissions.as_ref() == Some(declared) {
        return Ok(());
    }
    anyhow::bail!("the bundle for '{id}' declares other permissions than its catalog row says")
}

// A module id must be a safe directory name: it becomes `<modules>/<id>/`.
pub(crate) fn validate_id(id: &str) -> anyhow::Result<()> {
    let ok = !id.is_empty()
        && id.len() <= 128
        && id != "."
        && id != ".."
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    anyhow::ensure!(ok, "invalid module id {id:?}");
    Ok(())
}
