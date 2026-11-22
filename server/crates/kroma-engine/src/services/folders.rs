//! The folders an owner may point the server at: the ones the folder picker
//! offers, under the machine's volumes when it has any.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

/// Why a folder the owner named is not one the picker would offer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FolderRefusal {
    /// Outside the machine's volumes, or named through `..`.
    Outside,
    /// Not there, or not a folder.
    Missing,
}

/// The volume roots of a NAS that has them (`/volume1`, `/volumeUSB1`), and
/// none on any other machine.
pub fn volume_roots() -> Vec<PathBuf> {
    std::fs::read_dir("/")
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_dir()
                && path
                    .file_name()
                    .and_then(OsStr::to_str)
                    .is_some_and(|name| name.starts_with("volume"))
        })
        .collect()
}

/// Whether `path` is under one of `roots`. With no roots, anywhere is.
pub fn within_roots(path: &Path, roots: &[PathBuf]) -> bool {
    roots.is_empty() || roots.iter().any(|root| path.starts_with(root))
}

/// The folder `raw` names, resolved, when the folder picker would offer it.
pub fn picked_folder(raw: &str) -> Result<PathBuf, FolderRefusal> {
    let raw = raw.trim();
    if raw.contains("..") {
        return Err(FolderRefusal::Outside);
    }
    let folder = std::fs::canonicalize(raw).map_err(|_| FolderRefusal::Missing)?;
    if !folder.is_dir() {
        return Err(FolderRefusal::Missing);
    }
    if !within_roots(&folder, &volume_roots()) {
        return Err(FolderRefusal::Outside);
    }
    Ok(folder)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn with_volumes_present_a_folder_cannot_leave_them() {
        let roots = vec![PathBuf::from("/volume1"), PathBuf::from("/volumeUSB1")];

        let inside = [
            "/volume1/video/Films",
            "/volumeUSB1",
            "/etc",
            "/",
            "/root/.ssh",
        ]
        .map(|path| within_roots(Path::new(path), &roots));

        assert_eq!(inside, [true, true, false, false, false]);
    }

    #[test]
    fn a_path_that_merely_starts_with_a_root_name_is_not_inside_it() {
        let roots = vec![PathBuf::from("/volume1")];

        let inside =
            ["/volume10/video", "/volume1x"].map(|path| within_roots(Path::new(path), &roots));

        assert_eq!(inside, [false, false]);
    }

    #[test]
    fn with_no_volumes_at_all_a_dev_box_may_use_anywhere() {
        let inside = within_roots(Path::new("/etc"), &[]);

        assert!(inside);
    }

    #[test]
    fn a_folder_named_through_dot_dot_is_refused_before_it_is_looked_at() {
        let folder = kroma_testing::temp_dir("picked");
        let raw = format!("{}/../{}", folder.path().display(), "anything");

        let picked = picked_folder(&raw);

        assert_eq!(picked, Err(FolderRefusal::Outside));
    }

    #[test]
    fn a_folder_that_is_not_there_is_missing() {
        let folder = kroma_testing::temp_dir("picked");

        let picked = picked_folder(&folder.path().join("unplugged").to_string_lossy());

        assert_eq!(picked, Err(FolderRefusal::Missing));
    }

    #[test]
    fn a_file_is_not_a_folder() {
        let folder = kroma_testing::temp_dir("picked");
        let file = folder.path().join("notes.txt");
        std::fs::write(&file, "x").unwrap();

        let picked = picked_folder(&file.to_string_lossy());

        assert_eq!(picked, Err(FolderRefusal::Missing));
    }

    #[test]
    fn a_folder_is_kept_resolved() {
        let folder = kroma_testing::temp_dir("picked");
        let raw = format!("  {}/./  ", folder.path().display());

        let picked = picked_folder(&raw);

        assert_eq!(picked, Ok(std::fs::canonicalize(folder.path()).unwrap()));
    }
}
