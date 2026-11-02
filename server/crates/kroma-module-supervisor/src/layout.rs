//! An install laid out before the host kept its own files apart from a module's
//! data: each module's manifest, origin record, component, frontend, icon and
//! catalogs leave `modules/<id>` for `installed/<id>`, once, before any module
//! starts. The module's own data stays where it is.

use std::path::Path;

use super::install::validate_id;
use super::origin::{read_origin, sha256_hex, write_origin_to, Origin, ORIGIN_FILE};
use super::{Supervisor, HELPERS_DIR, LOCALES_DIR, MODULE_COMPONENT, NATIVE_BINARY};

const MOVING: &str = ".installed-moving";
const MANIFEST: &str = "module.json";
const HOST_FILES: [&str; 5] = [MANIFEST, MODULE_COMPONENT, NATIVE_BINARY, "icon.svg", "icon.png"];
const HOST_FOLDERS: [&str; 2] = ["fe", LOCALES_DIR];
const OLD_COMPILED_COPY: [&str; 2] = ["module.cwasm", "module.stamp"];

impl Supervisor {
    pub(crate) fn keep_installs_apart(&self) {
        let root = self.installed_root();
        if root.exists() {
            return;
        }
        let moving = self.cfg.data_dir.join(MOVING);
        let _ = std::fs::remove_dir_all(&moving);
        let copied = self
            .copy_installs(&moving)
            .and_then(|ids| std::fs::rename(&moving, &root).map(|()| ids));
        match copied {
            Ok(ids) => {
                for id in ids {
                    self.forget_old_layout(&id);
                    tracing::info!(module = %id, "moved what the host installed out of the module's own folder");
                }
            }
            Err(error) => {
                let _ = std::fs::remove_dir_all(&moving);
                tracing::error!(
                    %error,
                    "the installed modules could not be moved out of their own folders; none starts until they are",
                );
            }
        }
    }

    fn copy_installs(&self, moving: &Path) -> std::io::Result<Vec<String>> {
        std::fs::create_dir_all(moving)?;
        let Ok(entries) = std::fs::read_dir(&self.cfg.modules_dir) else {
            return Ok(Vec::new());
        };
        let mut ids = Vec::new();
        for entry in entries {
            let entry = entry?;
            let id = entry.file_name().to_string_lossy().into_owned();
            let own = entry.path();
            let installed_here = entry.file_type()?.is_dir()
                && !id.starts_with('.')
                && validate_id(&id).is_ok()
                && is_file(&own.join(MANIFEST));
            if installed_here {
                copy_install(&own, &moving.join(&id))?;
                ids.push(id);
            }
        }
        Ok(ids)
    }

    fn forget_old_layout(&self, id: &str) {
        let own = self.own_dir(id);
        for name in HOST_FILES.into_iter().chain([ORIGIN_FILE]) {
            let _ = std::fs::remove_file(own.join(name));
        }
        for name in HOST_FOLDERS {
            let _ = std::fs::remove_dir_all(own.join(name));
        }
        let helpers = self.cfg.data_dir.join(HELPERS_DIR).join(id);
        for name in OLD_COMPILED_COPY {
            let _ = std::fs::remove_file(helpers.join(name));
        }
    }
}

fn is_file(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok_and(|meta| meta.is_file())
}

fn copy_install(own: &Path, dest: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dest)?;
    for name in HOST_FILES {
        let from = own.join(name);
        if is_file(&from) {
            copy_file(&from, &dest.join(name))?;
        }
    }
    for name in HOST_FOLDERS {
        copy_tree(&own.join(name), &dest.join(name))?;
    }
    let mut origin = is_file(&own.join(ORIGIN_FILE))
        .then(|| read_origin(own))
        .flatten()
        .unwrap_or_else(Origin::unknown);
    origin.component_sha256 = std::fs::read(dest.join(MODULE_COMPONENT))
        .ok()
        .map(|wasm| sha256_hex(&wasm));
    write_origin_to(dest, &origin)
}

fn copy_file(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::write(to, std::fs::read(from)?)?;
    let modified = std::fs::symlink_metadata(from)?.modified()?;
    std::fs::File::options().write(true).open(to)?.set_modified(modified)
}

fn copy_tree(from: &Path, to: &Path) -> std::io::Result<()> {
    if !std::fs::symlink_metadata(from).is_ok_and(|meta| meta.is_dir()) {
        return Ok(());
    }
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        let target = to.join(entry.file_name());
        if kind.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else if kind.is_file() {
            copy_file(&entry.path(), &target)?;
        }
    }
    Ok(())
}
