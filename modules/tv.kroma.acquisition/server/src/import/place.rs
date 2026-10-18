//! Putting a release's bytes where the library expects them. Hardlink first
//! (the torrent keeps seeding from its download folder for free), reflink or
//! copy across filesystems.

use std::path::{Path, PathBuf};

use anyhow::Result;
use kroma_module_sdk::host::HostCtx;

pub(super) fn ext_of(path: &Path) -> &str {
    path.extension()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("mkv")
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Placement {
    Skip,
    Replace,
    Beside,
}

// An upgrade must land even when its rendered name matches the file it
// replaces (a PROPER of the same quality). With replacement on it writes beside
// the destination, retires what is there and renames over it; with replacement
// off both files are kept; a plain import still leaves an existing file alone.
pub(crate) fn place(
    host: &dyn HostCtx,
    src: &Path,
    dest: &Path,
    mode: Placement,
) -> Result<PathBuf> {
    if dest.exists() {
        match mode {
            Placement::Skip => return Ok(dest.to_path_buf()),
            Placement::Replace => {
                let staged = dest.with_extension("kroma-upgrade");
                let _ = std::fs::remove_file(&staged);
                write_to(src, &staged)?;
                super::recycle::retire(host, dest)?;
                std::fs::rename(&staged, dest)?;
                return Ok(dest.to_path_buf());
            }
            Placement::Beside => {
                let free = free_path(dest);
                write_to(src, &free)?;
                return Ok(free);
            }
        }
    }
    write_to(src, dest)?;
    Ok(dest.to_path_buf())
}

fn free_path(dest: &Path) -> PathBuf {
    let parent = dest.parent().unwrap_or_else(|| Path::new("."));
    let stem = dest
        .file_stem()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("release");
    let ext = ext_of(dest);
    for n in 2..1000u32 {
        let candidate = parent.join(format!("{stem} ({n}).{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dest.to_path_buf()
}

fn write_to(src: &Path, dest: &Path) -> Result<()> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if std::fs::hard_link(src, dest).is_ok() {
        return Ok(());
    }
    // Reflink (FICLONE): a copy-on-write clone across subvolumes of one Btrfs/XFS
    // filesystem: the Synology case, where hard link fails and DSM's old kernel
    // won't reflink through std::fs::copy.
    #[cfg(target_os = "linux")]
    if try_reflink(src, dest).is_ok() {
        return Ok(());
    }
    std::fs::copy(src, dest)?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn try_reflink(src: &Path, dest: &Path) -> std::io::Result<()> {
    let src_f = std::fs::File::open(src)?;
    let dest_f = std::fs::File::create(dest)?;
    match rustix::fs::ioctl_ficlone(&dest_f, &src_f) {
        Ok(()) => Ok(()),
        Err(e) => {
            drop(dest_f);
            // Clean up so the caller's copy fallback starts from a fresh destination.
            let _ = std::fs::remove_file(dest);
            Err(e.into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_module_sdk::host::testing::StubHost;

    fn write(path: &Path, body: &str) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, body).unwrap();
    }

    fn tmp(name: &str) -> kroma_module_sdk::testing::TempDir {
        kroma_module_sdk::testing::temp_dir(&format!("import-{name}"))
    }

    #[test]
    fn a_plain_import_leaves_an_existing_destination_alone() {
        let scratch = tmp("plain");
        let (src, dest) = (
            scratch.path().join("new.mkv"),
            scratch.path().join("out/old.mkv"),
        );
        write(&src, "new");
        write(&dest, "old");

        let at = place(&StubHost::new(), &src, &dest, Placement::Skip).unwrap();
        assert_eq!(std::fs::read_to_string(&dest).unwrap(), "old");
        assert_eq!(at, dest);
    }

    #[test]
    fn an_upgrade_overwrites_a_same_named_destination() {
        // A PROPER of the same quality renders to the same filename, so without
        // the overwrite the better release would silently never land.
        let scratch = tmp("upgrade");
        let (src, dest) = (
            scratch.path().join("new.mkv"),
            scratch.path().join("out/same.mkv"),
        );
        write(&src, "new");
        write(&dest, "old");

        let at = place(&StubHost::new(), &src, &dest, Placement::Replace).unwrap();
        assert_eq!(std::fs::read_to_string(&dest).unwrap(), "new");
        assert_eq!(at, dest);
        assert!(
            !dest.with_extension("kroma-upgrade").exists(),
            "the staging file is renamed away"
        );
    }

    #[test]
    fn an_upgrade_that_must_not_replace_keeps_both_files() {
        let scratch = tmp("beside");
        let (src, dest) = (
            scratch.path().join("new.mkv"),
            scratch.path().join("out/same.mkv"),
        );
        write(&src, "new");
        write(&dest, "old");

        let at = place(&StubHost::new(), &src, &dest, Placement::Beside).unwrap();
        assert_eq!(
            std::fs::read_to_string(&dest).unwrap(),
            "old",
            "the original survives"
        );
        assert_ne!(at, dest);
        assert_eq!(
            std::fs::read_to_string(&at).unwrap(),
            "new",
            "and the upgrade lands"
        );
    }

    #[test]
    fn keeping_both_twice_does_not_collide() {
        let scratch = tmp("beside-twice");
        let (src, dest) = (
            scratch.path().join("new.mkv"),
            scratch.path().join("out/same.mkv"),
        );
        write(&src, "new");
        write(&dest, "old");

        let first = place(&StubHost::new(), &src, &dest, Placement::Beside).unwrap();
        let second = place(&StubHost::new(), &src, &dest, Placement::Beside).unwrap();
        assert_ne!(first, second);
        assert!(first.exists() && second.exists());
    }

    #[test]
    fn placing_into_a_missing_folder_creates_it() {
        let scratch = tmp("mkdir");
        let (src, dest) = (
            scratch.path().join("new.mkv"),
            scratch.path().join("a/b/c.mkv"),
        );
        write(&src, "new");

        let at = place(&StubHost::new(), &src, &dest, Placement::Skip).unwrap();
        assert_eq!(std::fs::read_to_string(&dest).unwrap(), "new");
        assert_eq!(at, dest);
    }

    #[test]
    fn a_same_name_replacement_sends_the_file_it_overwrites_to_the_bin() {
        let scratch = tmp("replace-bin");
        let bin = tmp("replace-bin-target");
        let host = StubHost::new().with_setting(
            "acqRecycleBin",
            serde_json::json!(bin.path().to_string_lossy()),
        );
        let (src, dest) = (
            scratch.path().join("new.mkv"),
            scratch.path().join("out/same.mkv"),
        );
        write(&src, "new");
        write(&dest, "old");

        place(&host, &src, &dest, Placement::Replace).unwrap();

        assert_eq!(std::fs::read_to_string(&dest).unwrap(), "new");
        let recycled: Vec<_> = walkdir::WalkDir::new(bin.path())
            .into_iter()
            .flatten()
            .filter(|e| e.file_type().is_file())
            .map(|e| std::fs::read_to_string(e.path()).unwrap())
            .collect();
        assert_eq!(recycled, ["old"]);
    }
}
