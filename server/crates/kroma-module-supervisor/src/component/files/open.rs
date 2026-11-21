//! Opening a file in a folder a module holds, one name at a time from the
//! folder itself, so a link the module planted on the way is never followed.

use std::ffi::{CString, OsStr};
use std::fs::{File, OpenOptions};
use std::io::{Error, ErrorKind, Result};
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::path::{Path, PathBuf};

use kroma_wasm_host::Preopen;

use super::{is_plain, real_location};

const NEW_FILE_MODE: libc::c_uint = 0o666;

/// Opens `path` for reading when it is a regular file in one of `roots`.
pub(in crate::component) fn open_to_read(path: &Path, roots: &[Preopen]) -> Result<File> {
    let (root, rest) = located(path, roots.iter())?;
    regular(opened_below(&root, &rest, libc::O_RDONLY)?)
}

/// Opens `path` for writing, created or emptied, when it is in one of the
/// writable `roots` and is a regular file with no other name.
pub(in crate::component) fn open_to_write(path: &Path, roots: &[Preopen]) -> Result<File> {
    let writable = roots.iter().filter(|root| root.writable);
    let (root, rest) = located(path, writable)?;
    let file = regular(opened_below(&root, &rest, libc::O_WRONLY | libc::O_CREAT)?)?;
    if file.metadata()?.nlink() > 1 {
        return Err(Error::new(
            ErrorKind::PermissionDenied,
            "the file has another name",
        ));
    }
    file.set_len(0)?;
    Ok(file)
}

fn not_held() -> Error {
    Error::new(
        ErrorKind::PermissionDenied,
        "not in a folder this module holds",
    )
}

fn located<'a>(
    path: &Path,
    roots: impl Iterator<Item = &'a Preopen>,
) -> Result<(PathBuf, PathBuf)> {
    let real = is_plain(path)
        .then(|| real_location(path))
        .flatten()
        .ok_or_else(not_held)?;
    roots
        .filter_map(|root| std::fs::canonicalize(&root.host).ok())
        .find_map(|root| {
            let rest = real.strip_prefix(&root).ok()?.to_path_buf();
            Some((root, rest))
        })
        .ok_or_else(not_held)
}

fn opened_below(root: &Path, rest: &Path, access: libc::c_int) -> Result<File> {
    let names: Vec<&OsStr> = rest.iter().collect();
    let Some((last, folders)) = names.split_last() else {
        return Err(Error::new(
            ErrorKind::InvalidInput,
            "a folder is not a file",
        ));
    };
    let mut folder = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY)
        .open(root)?;
    for name in folders {
        folder = opened_at(&folder, name, libc::O_RDONLY | libc::O_DIRECTORY)?;
    }
    opened_at(&folder, last, access)
}

fn opened_at(folder: &File, name: &OsStr, flags: libc::c_int) -> Result<File> {
    let name = CString::new(name.as_bytes())?;
    let flags = flags | libc::O_NOFOLLOW | libc::O_CLOEXEC;
    // SAFETY: `folder` stays open for the call and `name` is NUL-terminated and outlives it.
    let fd = unsafe { libc::openat(folder.as_raw_fd(), name.as_ptr(), flags, NEW_FILE_MODE) };
    if fd < 0 {
        return Err(Error::last_os_error());
    }
    // SAFETY: openat just returned `fd`, and nothing else owns it.
    Ok(File::from(unsafe { OwnedFd::from_raw_fd(fd) }))
}

fn regular(file: File) -> Result<File> {
    if file.metadata()?.is_file() {
        return Ok(file);
    }
    Err(Error::new(ErrorKind::InvalidInput, "not a regular file"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root(host: &Path, writable: bool) -> Preopen {
        Preopen {
            host: host.to_path_buf(),
            guest: host.to_string_lossy().into_owned(),
            writable,
        }
    }

    #[test]
    fn a_link_between_the_root_and_the_file_is_not_followed() {
        let dir = kroma_testing::temp_dir("open-link-between");
        std::fs::create_dir(dir.path().join("real")).unwrap();
        std::fs::write(dir.path().join("real/file"), "x").unwrap();
        std::os::unix::fs::symlink("real", dir.path().join("link")).unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();

        let opened = opened_below(&root, Path::new("link/file"), libc::O_RDONLY);

        assert!(opened.is_err());
    }

    #[test]
    fn a_path_in_no_root_is_not_opened() {
        let dir = kroma_testing::temp_dir("open-no-root");
        let (held, other) = (dir.path().join("held"), dir.path().join("other"));
        std::fs::create_dir(&held).unwrap();
        std::fs::create_dir(&other).unwrap();

        let opened = open_to_write(&other.join("new"), &[root(&held, true)]);

        assert_eq!(opened.unwrap_err().kind(), ErrorKind::PermissionDenied);
        assert!(!other.join("new").exists());
    }

    #[test]
    fn a_folder_is_not_opened_as_a_file() {
        let dir = kroma_testing::temp_dir("open-folder");
        std::fs::create_dir(dir.path().join("sub")).unwrap();
        let roots = [root(dir.path(), false)];

        let inside = open_to_read(&dir.path().join("sub"), &roots);
        let itself = open_to_read(dir.path(), &roots);

        assert_eq!(inside.unwrap_err().kind(), ErrorKind::InvalidInput);
        assert_eq!(itself.unwrap_err().kind(), ErrorKind::InvalidInput);
    }

    #[test]
    fn a_read_only_root_is_not_opened_for_writing() {
        let dir = kroma_testing::temp_dir("open-read-only");
        std::fs::write(dir.path().join("f"), "kept").unwrap();
        let roots = [root(dir.path(), false)];

        let opened = open_to_write(&dir.path().join("f"), &roots);

        assert_eq!(opened.unwrap_err().kind(), ErrorKind::PermissionDenied);
        assert_eq!(std::fs::read(dir.path().join("f")).unwrap(), b"kept");
    }
}
