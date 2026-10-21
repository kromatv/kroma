use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::Result;

use kroma_module_sdk::engine::model::MediaFile;

pub(super) fn current_abs(file: &MediaFile) -> Option<PathBuf> {
    file.abs_path
        .as_deref()
        .filter(|p| !p.starts_with("demo://"))
        .map(PathBuf::from)
}

// The library folder that contains `abs` (so a rename stays within the same
// root / filesystem).
pub(super) fn library_root(
    folders: &HashMap<String, Vec<PathBuf>>,
    lib_id: &str,
    abs: &Path,
) -> Option<PathBuf> {
    let roots = folders.get(lib_id)?;
    roots
        .iter()
        .find(|root| abs.starts_with(root))
        .cloned()
        .or_else(|| roots.first().cloned())
}

// Rename in place, refusing to overwrite an existing different file.
pub(super) fn move_file(from: &Path, to: &Path) -> Result<()> {
    if from == to {
        return Ok(());
    }
    if to.exists() {
        anyhow::bail!("target already exists: {}", to.display());
    }
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent)?;
    }
    // Same filesystem: an atomic rename (keeps the inode). Cross-device: copy
    // then remove the source.
    match std::fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(_) => {
            std::fs::copy(from, to)?;
            std::fs::remove_file(from)?;
            Ok(())
        }
    }
}

// Removes now-empty source directories up to (but not including) the library
// root, so a rename doesn't leave orphan folders behind.
pub(super) fn prune_empty_dirs(dir: Option<&Path>, root: &Path) {
    let mut cur = dir.map(Path::to_path_buf);
    while let Some(d) = cur {
        if d == root || !d.starts_with(root) {
            break;
        }
        let empty = std::fs::read_dir(&d)
            .map(|mut e| e.next().is_none())
            .unwrap_or(false);
        if !empty || std::fs::remove_dir(&d).is_err() {
            break;
        }
        cur = d.parent().map(Path::to_path_buf);
    }
}
