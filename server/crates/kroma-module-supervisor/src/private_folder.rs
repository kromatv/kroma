use std::io;
use std::os::unix::fs::{DirBuilderExt, MetadataExt, PermissionsExt};
use std::path::Path;

pub(crate) fn private_folder(dir: &Path) -> io::Result<()> {
    if let Some(parent) = dir.parent() {
        std::fs::create_dir_all(parent)?;
    }
    match std::fs::DirBuilder::new().mode(0o700).create(dir) {
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
        created => created?,
    }
    let meta = std::fs::symlink_metadata(dir)?;
    // SAFETY: geteuid cannot fail and touches no memory.
    let uid = unsafe { libc::geteuid() };
    if meta.is_dir() && meta.uid() == uid && meta.mode() & 0o077 != 0 {
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mode(path: &Path) -> u32 {
        std::fs::symlink_metadata(path).unwrap().permissions().mode() & 0o777
    }

    #[test]
    fn a_new_folder_is_open_to_its_owner_alone() {
        let root = kroma_testing::temp_dir("private-new");
        let dir = root.path().join("modules/tv.example");

        private_folder(&dir).unwrap();

        assert_eq!(mode(&dir), 0o700);
    }

    #[test]
    fn a_folder_open_to_others_is_closed_to_them() {
        let root = kroma_testing::temp_dir("private-tightened");
        let dir = root.path().join("vpn");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();

        private_folder(&dir).unwrap();

        assert_eq!(mode(&dir), 0o700);
    }

    #[test]
    fn a_link_the_operator_made_is_left_as_it_is() {
        let root = kroma_testing::temp_dir("private-link");
        let shared = root.path().join("shared");
        std::fs::create_dir_all(&shared).unwrap();
        std::fs::set_permissions(&shared, std::fs::Permissions::from_mode(0o755)).unwrap();
        let link = root.path().join("torrents");
        std::os::unix::fs::symlink(&shared, &link).unwrap();

        private_folder(&link).unwrap();

        assert_eq!(mode(&shared), 0o755);
    }
}
