//! The folders a component holds, each at the path it has on the host.

mod downloads;
mod server_files;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use kroma_module_manifest::{FsRoot, ModuleManifest};
use kroma_wasm_host::Preopen;

use crate::Supervisor;

/// A list of folders, asked again each time a module starts.
pub type Folders = Arc<dyn Fn() -> Vec<PathBuf> + Send + Sync>;

/// Where the named roots are on this machine, as the core answers them: the
/// library folders behind `media`, the folders the operator named for downloads
/// (a recycle bin included) behind `downloads`, and the folders holding the
/// server's own files besides its data directory. No module holds one of those,
/// nor a download folder above one, and a library folder above one is read-only.
#[derive(Clone)]
pub struct FolderRoots {
    pub media: Folders,
    pub downloads: Folders,
    pub server_dirs: Vec<PathBuf>,
}

impl FolderRoots {
    /// No library, no download folder, and nothing of the server's outside its
    /// data directory.
    pub fn none() -> Self {
        Self {
            media: Arc::new(Vec::new),
            downloads: Arc::new(Vec::new),
            server_dirs: Vec::new(),
        }
    }
}

const TMP: &str = "/tmp";
const RESERVED_DATA_DIRS: [&str; 6] = ["modules", "installed", "run", "logs", "backups", "helpers"];

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

pub(super) fn declares(manifest: &ModuleManifest, root: FsRoot) -> bool {
    manifest
        .permissions
        .as_ref()
        .is_some_and(|p| p.fs.read.contains(&root) || p.fs.write.contains(&root))
}

fn held(dir: impl Into<PathBuf>, writable: bool) -> Preopen {
    let dir = dir.into();
    let guest = dir.to_string_lossy().into_owned();
    Preopen {
        host: dir.canonicalize().unwrap_or(dir),
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
        folders: &FolderRoots,
        downloads: &[PathBuf],
    ) -> anyhow::Result<Vec<Preopen>> {
        let default_fs = kroma_module_manifest::FsPermissions::default();
        let permissions = manifest.permissions.as_ref();
        let fs = permissions.map_or(&default_fs, |p| &p.fs);
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
        roots.push(held(self.own_dir(id), own_writable));
        if first_party {
            for name in manifest.data_dirs.iter().filter(|name| is_data_dir_name(name)) {
                let dir = self.cfg.data_dir.join(name);
                std::fs::create_dir_all(&dir)?;
                roots.push(held(dir, own_writable));
            }
        }
        let writable = fs.write.contains(&FsRoot::Downloads);
        roots.extend(downloads.iter().map(|dir| held(dir, writable)));
        let files = self.server_files(folders);
        if declares(manifest, FsRoot::Media) {
            let writable = fs.write.contains(&FsRoot::Media);
            roots.extend(
                (folders.media)()
                    .into_iter()
                    .filter(|root| root.is_dir() && !files.inside_reserved(root))
                    .map(|root| {
                        let writable = writable && !files.above(&root);
                        held(root, writable)
                    }),
            );
        }
        for name in permissions.map_or(&[][..], |p| p.env.as_slice()) {
            if let Some(path) = std::env::var_os(name).map(PathBuf::from) {
                if path.is_absolute()
                    && path.is_dir()
                    && !files.above(&path)
                    && !files.inside_reserved(&path)
                {
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

    #[test]
    fn a_folder_is_opened_where_it_really_is_and_seen_where_it_was_named() {
        let root = kroma_testing::temp_dir("roots-link");
        let real = root.path().join("volume");
        std::fs::create_dir_all(&real).unwrap();
        let link = root.path().join("var");
        std::os::unix::fs::symlink(&real, &link).unwrap();

        let preopen = held(&link, true);

        assert_eq!(preopen.host, real.canonicalize().unwrap());
        assert_eq!(preopen.guest, link.to_string_lossy());
    }
}
