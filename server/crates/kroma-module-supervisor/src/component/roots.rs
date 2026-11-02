//! The folders a component holds, each at the path it has on the host.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use kroma_module_manifest::{FsRoot, ModuleManifest};
use kroma_wasm_host::Preopen;

use crate::Supervisor;

/// The folders a module that declares the `media` root can reach.
pub type MediaRoots = Arc<dyn Fn() -> Vec<PathBuf> + Send + Sync>;

const ROOT: &str = "/";
const TMP: &str = "/tmp";
const RESERVED_DATA_DIRS: [&str; 5] = ["modules", "run", "logs", "backups", "helpers"];

fn is_data_dir_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        && !RESERVED_DATA_DIRS.contains(&name)
}

fn holds(outer: &Path, inner: &Path) -> bool {
    let canonical = |path: &Path| path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    canonical(inner).starts_with(canonical(outer))
}

fn held(host: impl Into<PathBuf>, writable: bool) -> Preopen {
    let host = host.into();
    let guest = host.to_string_lossy().into_owned();
    Preopen {
        host,
        guest,
        writable,
    }
}

impl Supervisor {
    pub(super) fn component_roots(
        &self,
        id: &str,
        manifest: &ModuleManifest,
        first_party: bool,
        media: &MediaRoots,
    ) -> anyhow::Result<Vec<Preopen>> {
        let default_fs = kroma_module_manifest::FsPermissions::default();
        let permissions = manifest.permissions.as_ref();
        let fs = permissions.map_or(&default_fs, |p| &p.fs);
        let declares = |root: FsRoot| fs.read.contains(&root) || fs.write.contains(&root);
        let mut roots = Vec::new();

        let run_dir = self.run.prepare_module_dir(id)?;
        let tmp = run_dir
            .parent()
            .map(|dir| dir.join("tmp"))
            .ok_or_else(|| anyhow::anyhow!("'{id}' has no run directory"))?;
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp)?;
        roots.push(Preopen {
            host: tmp,
            guest: TMP.to_string(),
            writable: true,
        });

        let own_writable = fs.write.contains(&FsRoot::Module) || manifest.storage.is_some();
        roots.push(held(self.dir(id), own_writable));
        if first_party {
            for name in manifest.data_dirs.iter().filter(|name| is_data_dir_name(name)) {
                let dir = self.cfg.data_dir.join(name);
                std::fs::create_dir_all(&dir)?;
                roots.push(held(dir, own_writable));
            }
        }
        // A download client reports where a torrent landed, a path nobody can list
        // ahead of time, so an official module that declares it keeps the machine.
        if first_party && declares(FsRoot::Downloads) {
            roots.push(Preopen {
                host: PathBuf::from(ROOT),
                guest: ROOT.to_string(),
                writable: fs.write.contains(&FsRoot::Downloads),
            });
            return Ok(roots);
        }
        if declares(FsRoot::Media) {
            let writable = fs.write.contains(&FsRoot::Media);
            let data_dir = &self.cfg.data_dir;
            roots.extend(
                media()
                    .into_iter()
                    .filter(|root| root.is_dir())
                    .map(|root| {
                        let writable = writable && !holds(&root, data_dir);
                        held(root, writable)
                    }),
            );
        }
        for name in permissions.map_or(&[][..], |p| p.env.as_slice()) {
            if let Some(path) = std::env::var_os(name).map(PathBuf::from) {
                if path.is_absolute() && path.is_dir() {
                    roots.push(held(path, false));
                }
            }
        }
        Ok(roots)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_data_dir_is_a_bare_name_outside_the_cores_own() {
        assert!(is_data_dir_name("qbittorrent"));
        assert!(is_data_dir_name("indexer-defs"));
        assert!(!is_data_dir_name(""));
        assert!(!is_data_dir_name(".."));
        assert!(!is_data_dir_name("a/b"));
        assert!(!is_data_dir_name("modules"));
        assert!(!is_data_dir_name("run"));
    }

    #[test]
    fn a_folder_holds_the_folders_beneath_it_and_itself() {
        let root = kroma_testing::temp_dir("roots");
        let data = root.path().join("kroma");
        std::fs::create_dir_all(&data).unwrap();

        let held = (holds(root.path(), &data), holds(&data, &data), holds(&data, root.path()));

        assert_eq!(held, (true, true, false));
    }
}
