//! The install pipeline: staging a `.kmod` beside the module it replaces,
//! validating what the archive carries, and swapping it in.

use std::borrow::Cow;
use std::path::{Path, PathBuf};

use kroma_module_manifest::ModuleManifest;

use super::registry::MAX_BUNDLE_BYTES;

use super::{check_manifest_schema, Supervisor, MODULE_BIN, MODULE_STORE, STAGING_PREFIX};

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
        check_manifest_schema(&id, &manifest)?;
        kroma_module_manifest::engines_satisfied(&manifest.engines, &self.cfg.server_version)
            .map_err(|reason| anyhow::anyhow!("'{id}' {reason}"))?;
        Ok((id, manifest))
    }

    // A module's own database sits INSIDE the directory a new bundle replaces,
    // so it moves into staging and rides the rename across. Without this an
    // upgrade deleted every row the module owned, adopted tables included.
    fn carry_store(&self, id: &str, staging: &Path) {
        let installed = self.dir(id);
        for suffix in ["", "-wal", "-shm"] {
            let name = format!("{MODULE_STORE}{suffix}");
            let from = installed.join(&name);
            if !from.exists() {
                continue;
            }
            if let Err(error) = std::fs::rename(&from, staging.join(&name)) {
                tracing::error!(
                    module = %id, file = %name, %error,
                    "could not carry this module's database across the upgrade",
                );
                self.say(
                    id,
                    "ERROR this module's database could not be kept across the upgrade",
                );
            }
        }
    }

    /// Unpack a `.kmod` bundle under `<modules_dir>/<id>/` and spawn it,
    /// returning the module's manifest JSON.
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
        origin: (&str, Option<&str>),
    ) -> anyhow::Result<ModuleManifest> {
        let tar_bytes = decompressed_tar(bytes)?;

        let staging = self
            .cfg
            .modules_dir
            .join(format!("{STAGING_PREFIX}{}", rand::random::<u32>()));
        std::fs::create_dir_all(&staging)?;
        let result = (|| {
            unpack_validated(&tar_bytes, &staging)?;
            let (id, manifest) = self.staged_manifest(&staging, expected_id)?;
            self.stop(&id);
            let dest = self.dir(&id);
            self.carry_store(&id, &staging);
            let _ = std::fs::remove_dir_all(&dest);
            std::fs::rename(&staging, &dest)?;
            // Before `spawn` below, which reads the manifest again to build the
            // module's storage grant: from the cache it would build the grant
            // the PREVIOUS version declared.
            self.invalidate_manifests();
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let bin = dest.join(MODULE_BIN);
                if bin.exists() {
                    std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755))?;
                }
            }
            self.write_origin(&id, origin.0, origin.1);
            if self.has_binary(&id) {
                self.spawn(&id)?;
            } else {
                // A library module is a leaf crate co-linked into the processes
                // that need it, so it has no process of its own to start.
                tracing::info!(module = %id, "library module installed (no binary to spawn)");
            }
            Ok::<ModuleManifest, anyhow::Error>(manifest)
        })();
        let _ = std::fs::remove_dir_all(&staging);
        self.invalidate_manifests();
        result
    }

    pub fn uninstall(&self, id: &str) -> anyhow::Result<()> {
        validate_id(id)?;
        self.stop(id);
        std::fs::remove_dir_all(self.dir(id))?;
        self.invalidate_manifests();
        Ok(())
    }
}

// A module id must be a safe directory name: it becomes `<modules>/<id>/`.
fn validate_id(id: &str) -> anyhow::Result<()> {
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

// Keeps only `Normal` path components (dropping `..` and absolute prefixes) and
// only allow-listed bundle files: an entry path must never escape the install dir.
fn sanitized_entry(raw: &std::path::Path) -> Option<PathBuf> {
    use std::path::Component;
    let safe: PathBuf = raw
        .components()
        .filter_map(|c| match c {
            Component::Normal(p) => Some(p),
            _ => None,
        })
        .collect();
    if safe.as_os_str().is_empty() {
        return None;
    }
    let rel = safe.to_string_lossy().replace('\\', "/");
    let allowed = matches!(
        rel.as_ref(),
        "module.json" | "module" | "icon.svg" | "icon.png"
    ) || rel.starts_with("fe/");
    allowed.then_some(safe)
}

// `.kmod` is a zstd tar; gzip (legacy) and raw tar are also accepted,
// dispatched by magic bytes.
fn decompressed_tar(bytes: &[u8]) -> anyhow::Result<Cow<'_, [u8]>> {
    if bytes.starts_with(&[0x28, 0xb5, 0x2f, 0xfd]) {
        let decoder = ruzstd::StreamingDecoder::new(bytes)?;
        return Ok(Cow::Owned(read_bounded(decoder, MAX_TAR_BYTES)?));
    }
    if bytes.starts_with(&[0x1f, 0x8b]) {
        let decoder = flate2::read::GzDecoder::new(bytes);
        return Ok(Cow::Owned(read_bounded(decoder, MAX_TAR_BYTES)?));
    }
    Ok(Cow::Borrowed(bytes))
}

// [`MAX_BUNDLE_BYTES`] bounds the bytes that arrive, not what they expand to: a
// few megabytes of zstd unpack to gigabytes, so the tar is bounded on its own
// axis rather than read into memory whole.
const MAX_TAR_BYTES: u64 = 4 * MAX_BUNDLE_BYTES;

fn read_bounded(reader: impl std::io::Read, max_bytes: u64) -> anyhow::Result<Vec<u8>> {
    use std::io::Read as _;
    let mut out = Vec::new();
    let read = reader.take(max_bytes + 1).read_to_end(&mut out)? as u64;
    anyhow::ensure!(
        read <= max_bytes,
        "bundle expands past {max_bytes} bytes; refusing to install"
    );
    Ok(out)
}

fn unpack_validated(tar_bytes: &[u8], dest: &std::path::Path) -> anyhow::Result<()> {
    let mut archive = tar::Archive::new(tar_bytes);
    for entry in archive.entries()? {
        let mut entry = entry?;
        // Only ever write regular files: `sanitized_entry` rewrites an entry's
        // own path but not a link target, so a symlink passing the allow-list
        // would redirect a later write outside `dest`.
        if !entry.header().entry_type().is_file() {
            continue;
        }
        let raw = entry.path()?.into_owned();
        let Some(safe) = sanitized_entry(&raw) else {
            continue;
        };
        let out = dest.join(&safe);
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent)?;
        }
        entry.unpack(&out)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::read_bounded;

    #[test]
    fn a_stream_that_expands_past_the_ceiling_is_refused_rather_than_read() {
        let err = read_bounded(std::io::repeat(0u8), 1024)
            .unwrap_err()
            .to_string();

        assert!(err.contains("expands past 1024 bytes"), "{err}");
    }

    #[test]
    fn a_stream_that_fits_the_ceiling_exactly_is_read_whole() {
        let body = vec![7u8; 1024];

        let read = read_bounded(body.as_slice(), 1024).unwrap();

        assert_eq!(read, body);
    }
}
