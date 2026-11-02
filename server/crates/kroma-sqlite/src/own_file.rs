//! The databases the host keeps for a module: one folder per module that no
//! module holds, and an open that follows no link to or beside the file.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use rusqlite::{Connection, OpenFlags};

use crate::MODULE_DATABASES_DIR;

pub const JOURNALS: [&str; 3] = ["-wal", "-shm", "-journal"];

const FLAGS: OpenFlags = OpenFlags::SQLITE_OPEN_READ_WRITE
    .union(OpenFlags::SQLITE_OPEN_CREATE)
    .union(OpenFlags::SQLITE_OPEN_NOFOLLOW)
    .union(OpenFlags::SQLITE_OPEN_NO_MUTEX);

/// The folder the host keeps `module_id`'s databases in.
pub fn module_databases_dir(data_dir: &Path, module_id: &str) -> PathBuf {
    data_dir.join(MODULE_DATABASES_DIR).join(module_id)
}

/// The file SQLite keeps beside `database` under `suffix`, one of [`JOURNALS`].
pub fn journal_of(database: &Path, suffix: &str) -> PathBuf {
    let mut name = OsString::from(database.as_os_str());
    name.push(suffix);
    PathBuf::from(name)
}

/// Opens the database at `path`, creating it when absent. The folder is resolved
/// first, so a link above it is the host's own; the file and each of its
/// [`JOURNALS`] must then pass [`refuse_unowned`], and SQLite follows no link.
pub fn open_owned(path: &Path) -> Result<Connection> {
    let path = resolved(path)?;
    refuse_unowned(&path)?;
    Connection::open_with_flags(&path, FLAGS).with_context(|| format!("open {}", path.display()))
}

pub(crate) fn connect(path: &Path, scope: Option<&crate::authorizer::Scope>) -> Result<Connection> {
    match scope {
        Some(scope) if scope.is_own_file() => open_owned(path),
        _ => Connection::open(path).context("open sqlite connection"),
    }
}

/// Refuses `path` unless it, and every one of its [`JOURNALS`], is absent or a
/// regular file with a single link.
pub fn refuse_unowned(path: &Path) -> Result<()> {
    owned(path)?;
    for suffix in JOURNALS {
        owned(&journal_of(path, suffix))?;
    }
    Ok(())
}

fn resolved(path: &Path) -> Result<PathBuf> {
    let name = path
        .file_name()
        .with_context(|| format!("{} names no file", path.display()))?;
    let dir = path
        .parent()
        .filter(|dir| !dir.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let dir = dir
        .canonicalize()
        .with_context(|| format!("resolve {}", dir.display()))?;
    Ok(dir.join(name))
}

fn owned(path: &Path) -> Result<()> {
    let meta = match std::fs::symlink_metadata(path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error).with_context(|| format!("inspect {}", path.display())),
    };
    if !meta.file_type().is_file() {
        bail!("{} is not a regular file", path.display());
    }
    #[cfg(unix)]
    if std::os::unix::fs::MetadataExt::nlink(&meta) != 1 {
        bail!("{} has another name on this disk", path.display());
    }
    Ok(())
}

#[cfg(all(test, unix))]
mod tests;
