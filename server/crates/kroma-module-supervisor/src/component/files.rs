//! What WASI has no call for on the folders a module holds.

use std::path::{Component, Path, PathBuf};

use kroma_wasm_host::{Files, Preopen};

fn is_plain(path: &Path) -> bool {
    path.is_absolute() && !path.components().any(|part| part == Component::ParentDir)
}

// A symlink inside a held folder must not lead out of it, so what is compared is
// where the deepest existing part of `path` really is.
fn real_location(path: &Path) -> Option<PathBuf> {
    let mut existing = path;
    let mut below = Vec::new();
    loop {
        if let Ok(real) = std::fs::canonicalize(existing) {
            return Some(below.iter().rev().fold(real, |at: PathBuf, part| at.join(part)));
        }
        below.push(existing.file_name()?);
        existing = existing.parent()?;
    }
}

/// Whether `path` is in one of `roots`, writable ones only when `for_writing`.
pub(super) fn is_within(path: &Path, roots: &[Preopen], for_writing: bool) -> bool {
    if !is_plain(path) {
        return false;
    }
    let Some(real) = real_location(path) else {
        return false;
    };
    roots
        .iter()
        .filter(|root| root.writable || !for_writing)
        .filter_map(|root| std::fs::canonicalize(&root.host).ok())
        .any(|root| real.starts_with(root))
}

pub(super) struct ModuleFiles {
    roots: Vec<Preopen>,
}

impl ModuleFiles {
    pub(super) fn new(roots: Vec<Preopen>) -> Self {
        Self { roots }
    }
}

#[cfg(target_os = "linux")]
fn reflink(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::fd::AsRawFd;

    const FICLONE: libc::c_ulong = 0x4004_9409;
    let from = std::fs::File::open(source)?;
    let to = std::fs::File::create(destination)?;
    // SAFETY: both descriptors stay open for the call and FICLONE reads only them.
    let cloned = unsafe { libc::ioctl(to.as_raw_fd(), FICLONE as _, from.as_raw_fd()) };
    if cloned == 0 {
        return Ok(());
    }
    let error = std::io::Error::last_os_error();
    drop(to);
    let _ = std::fs::remove_file(destination);
    Err(error)
}

#[cfg(not(target_os = "linux"))]
fn reflink(_source: &Path, _destination: &Path) -> std::io::Result<()> {
    Err(std::io::ErrorKind::Unsupported.into())
}

impl Files for ModuleFiles {
    fn canonical(&self, path: &str) -> Option<String> {
        let path = Path::new(path);
        if !is_within(path, &self.roots, false) {
            return None;
        }
        std::fs::canonicalize(path)
            .ok()
            .map(|real| real.to_string_lossy().into_owned())
    }

    fn copy(&self, source: &str, destination: &str) -> Result<u64, String> {
        let (from, to) = (Path::new(source), Path::new(destination));
        if !is_within(from, &self.roots, false) {
            return Err(format!("{source} is not in a folder this module holds"));
        }
        if !is_within(to, &self.roots, true) {
            return Err(format!("{destination} is not in a folder this module may write"));
        }
        if reflink(from, to).is_ok() {
            return std::fs::metadata(to).map(|meta| meta.len()).map_err(|error| error.to_string());
        }
        std::fs::copy(from, to).map_err(|error| error.to_string())
    }
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
    fn a_path_outside_every_root_is_refused() {
        let dir = kroma_testing::temp_dir("files-outside");
        let roots = [root(dir.path(), true)];

        let held = is_within(Path::new("/etc/hosts"), &roots, false);

        assert!(!held);
    }

    #[test]
    fn a_parent_step_is_refused_even_when_it_lands_inside() {
        let dir = kroma_testing::temp_dir("files-parent");
        std::fs::create_dir(dir.path().join("a")).unwrap();
        let roots = [root(dir.path(), true)];

        let held = is_within(&dir.path().join("a/../b"), &roots, false);

        assert!(!held);
    }

    #[test]
    fn a_symlink_that_leads_out_of_a_root_is_refused() {
        let dir = kroma_testing::temp_dir("files-symlink");
        std::os::unix::fs::symlink("/etc", dir.path().join("out")).unwrap();
        let roots = [root(dir.path(), true)];

        let held = is_within(&dir.path().join("out/hosts"), &roots, false);

        assert!(!held);
    }

    #[test]
    fn a_file_not_yet_written_counts_as_where_it_would_land() {
        let dir = kroma_testing::temp_dir("files-new");
        let roots = [root(dir.path(), true)];

        let held = is_within(&dir.path().join("new/file.bin"), &roots, true);

        assert!(held);
    }

    #[test]
    fn a_read_only_root_does_not_count_for_writing() {
        let dir = kroma_testing::temp_dir("files-read-only");
        std::fs::write(dir.path().join("f"), "x").unwrap();
        let roots = [root(dir.path(), false)];

        let readable = is_within(&dir.path().join("f"), &roots, false);
        let writable = is_within(&dir.path().join("f"), &roots, true);

        assert!(readable);
        assert!(!writable);
    }

    #[test]
    fn a_copy_lands_and_answers_its_size() {
        let dir = kroma_testing::temp_dir("files-copy");
        std::fs::write(dir.path().join("from"), "hello").unwrap();
        let files = ModuleFiles::new(vec![root(dir.path(), true)]);

        let copied = files.copy(
            &dir.path().join("from").to_string_lossy(),
            &dir.path().join("to").to_string_lossy(),
        );

        assert_eq!(copied, Ok(5));
        assert_eq!(std::fs::read(dir.path().join("to")).unwrap(), b"hello");
    }
}
