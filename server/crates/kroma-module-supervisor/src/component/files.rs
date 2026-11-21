//! What WASI has no call for on the folders a module holds.

use std::fs::File;
use std::path::{Component, Path, PathBuf};

use kroma_wasm_host::{Files, Preopen};

use crate::asked::Watch;

mod open;

pub(super) use open::{open_to_read, open_to_write};

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
    watch: Watch,
}

impl ModuleFiles {
    pub(super) fn new(roots: Vec<Preopen>) -> Self {
        Self {
            roots,
            watch: Watch::default(),
        }
    }

    pub(super) fn watched(mut self, watch: Watch) -> Self {
        self.watch = watch;
        self
    }

    fn holds(&self, path: &str, writing: bool) -> bool {
        let held = is_within(Path::new(path), &self.roots, writing);
        self.watch.file(path, writing, held);
        held
    }
}

#[cfg(target_os = "linux")]
fn reflink(from: &File, to: &File) -> std::io::Result<()> {
    use std::os::fd::AsRawFd;

    const FICLONE: libc::c_ulong = 0x4004_9409;
    // SAFETY: both descriptors stay open for the call and FICLONE reads only them.
    let cloned = unsafe { libc::ioctl(to.as_raw_fd(), FICLONE as _, from.as_raw_fd()) };
    if cloned == 0 {
        return Ok(());
    }
    Err(std::io::Error::last_os_error())
}

#[cfg(not(target_os = "linux"))]
fn reflink(_from: &File, _to: &File) -> std::io::Result<()> {
    Err(std::io::ErrorKind::Unsupported.into())
}

impl Files for ModuleFiles {
    fn canonical(&self, path: &str) -> Option<String> {
        if !self.holds(path, false) {
            return None;
        }
        std::fs::canonicalize(Path::new(path))
            .ok()
            .map(|real| real.to_string_lossy().into_owned())
    }

    fn copy(&self, source: &str, destination: &str) -> Result<u64, String> {
        if !self.holds(source, false) {
            return Err(format!("{source} is not in a folder this module holds"));
        }
        if !self.holds(destination, true) {
            return Err(format!("{destination} is not in a folder this module may write"));
        }
        let from = open_to_read(Path::new(source), &self.roots)
            .map_err(|error| format!("{source}: {error}"))?;
        let to = open_to_write(Path::new(destination), &self.roots)
            .map_err(|error| format!("{destination}: {error}"))?;
        if reflink(&from, &to).is_ok() {
            return to
                .metadata()
                .map(|meta| meta.len())
                .map_err(|error| error.to_string());
        }
        std::io::copy(&mut &from, &mut &to).map_err(|error| error.to_string())
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

    #[test]
    fn a_dangling_link_in_a_root_is_not_written_through() {
        let dir = kroma_testing::temp_dir("files-dangling");
        let (inside, outside) = (dir.path().join("in"), dir.path().join("out"));
        std::fs::create_dir(&inside).unwrap();
        std::fs::create_dir(&outside).unwrap();
        std::fs::write(inside.join("from"), "hello").unwrap();
        std::os::unix::fs::symlink("../out/escaped", inside.join("link")).unwrap();
        let files = ModuleFiles::new(vec![root(&inside, true)]);

        let copied = files.copy(
            &inside.join("from").to_string_lossy(),
            &inside.join("link").to_string_lossy(),
        );

        assert!(copied.is_err(), "{copied:?}");
        assert!(!outside.join("escaped").exists());
    }

    #[test]
    fn a_link_to_a_file_inside_the_root_is_still_written() {
        let dir = kroma_testing::temp_dir("files-inner-link");
        std::fs::write(dir.path().join("from"), "hello").unwrap();
        std::fs::write(dir.path().join("target"), "an older and longer body").unwrap();
        std::os::unix::fs::symlink("target", dir.path().join("link")).unwrap();
        let files = ModuleFiles::new(vec![root(dir.path(), true)]);

        let copied = files.copy(
            &dir.path().join("from").to_string_lossy(),
            &dir.path().join("link").to_string_lossy(),
        );

        assert_eq!(copied, Ok(5));
        assert_eq!(std::fs::read(dir.path().join("target")).unwrap(), b"hello");
    }

    #[test]
    fn a_hard_link_to_a_file_the_module_may_only_read_is_not_written() {
        let dir = kroma_testing::temp_dir("files-hard-link");
        let (library, own) = (dir.path().join("library"), dir.path().join("own"));
        std::fs::create_dir(&library).unwrap();
        std::fs::create_dir(&own).unwrap();
        std::fs::write(library.join("film"), "the film").unwrap();
        std::fs::write(own.join("from"), "hello").unwrap();
        std::fs::hard_link(library.join("film"), own.join("film")).unwrap();
        let files = ModuleFiles::new(vec![root(&library, false), root(&own, true)]);

        let copied = files.copy(
            &own.join("from").to_string_lossy(),
            &own.join("film").to_string_lossy(),
        );

        assert!(copied.is_err(), "{copied:?}");
        assert_eq!(std::fs::read(library.join("film")).unwrap(), b"the film");
    }
}
