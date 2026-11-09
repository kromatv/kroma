//! Keeping a database to the user that runs KROMA: it holds session bearers and
//! provider keys, so no other account on the machine may read it or a copy.

use std::path::Path;

pub fn keep_private(path: &Path) {
    let journals = crate::JOURNALS
        .iter()
        .map(|suffix| crate::journal_of(path, suffix));
    let files = std::iter::once(path.to_path_buf())
        .chain(journals)
        .chain(crate::migrate::snapshots_of(path));
    for file in files {
        restrict(&file);
    }
}

#[cfg(unix)]
pub fn restrict(file: &Path) {
    use std::os::unix::fs::PermissionsExt;

    let Ok(meta) = std::fs::symlink_metadata(file) else {
        return;
    };
    if !meta.file_type().is_file() || meta.permissions().mode() & 0o077 == 0 {
        return;
    }
    if let Err(error) = std::fs::set_permissions(file, std::fs::Permissions::from_mode(0o600)) {
        tracing::warn!(file = %file.display(), %error, "a database file stays readable by other users");
    }
}

#[cfg(not(unix))]
pub fn restrict(_file: &Path) {}

#[cfg(all(test, unix))]
mod tests;
