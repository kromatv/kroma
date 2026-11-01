//! Where the seam's sockets live: the core's `host.sock`, and one directory per
//! module holding the socket its process serves on, each open to the server's
//! own user and nobody else. That is `<data>/run`, or a short directory under
//! `/tmp` named after the data directory when `<data>` is too deep for a socket
//! path to fit.

use std::io;
use std::path::{Path, PathBuf};

const HOST_SOCKET: &str = "host.sock";
const MODULE_SOCKET: &str = "module.sock";

const SOCKET_PATH_MAX: usize = if cfg!(any(target_os = "linux", target_os = "android")) {
    107
} else {
    103
};

const ID_ROOM: usize = 40;

#[derive(Debug, Clone)]
pub(crate) struct RunDir {
    root: PathBuf,
}

impl RunDir {
    pub(crate) fn for_data_dir(data_dir: &Path) -> Self {
        let preferred = data_dir.join("run");
        if fits(&Self::socket_in(&preferred, &"m".repeat(ID_ROOM))) {
            return Self { root: preferred };
        }
        Self {
            root: short_root(data_dir).unwrap_or(preferred),
        }
    }

    pub(crate) fn host_socket(&self) -> PathBuf {
        self.root.join(HOST_SOCKET)
    }

    fn socket_in(root: &Path, id: &str) -> PathBuf {
        root.join("modules").join(id).join(MODULE_SOCKET)
    }

    pub(crate) fn prepare_host(&self) -> io::Result<PathBuf> {
        private_dir(&self.root)?;
        let socket = self.host_socket();
        ensure_fits(&socket)?;
        remove_stale(&socket)?;
        Ok(socket)
    }

    pub(crate) fn prepare_module(&self, id: &str) -> io::Result<PathBuf> {
        private_dir(&self.root)?;
        private_dir(&self.root.join("modules"))?;
        let socket = Self::socket_in(&self.root, id);
        ensure_fits(&socket)?;
        private_dir(socket.parent().unwrap_or(&self.root))?;
        remove_stale(&socket)?;
        Ok(socket)
    }

    pub(crate) fn forget_module(&self, id: &str) {
        let _ = std::fs::remove_dir_all(self.root.join("modules").join(id));
    }
}

fn fits(socket: &Path) -> bool {
    socket.as_os_str().len() <= SOCKET_PATH_MAX
}

fn ensure_fits(socket: &Path) -> io::Result<()> {
    if fits(socket) {
        return Ok(());
    }
    Err(io::Error::new(
        io::ErrorKind::InvalidInput,
        format!(
            "{} is {} bytes long, past the {SOCKET_PATH_MAX} a Unix socket address holds",
            socket.display(),
            socket.as_os_str().len()
        ),
    ))
}

fn remove_stale(socket: &Path) -> io::Result<()> {
    match std::fs::remove_file(socket) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

#[cfg(unix)]
fn short_root(data_dir: &Path) -> Option<PathBuf> {
    use sha2::Digest;
    let absolute = std::path::absolute(data_dir).unwrap_or_else(|_| data_dir.to_path_buf());
    let digest = sha2::Sha256::digest(absolute.as_os_str().as_encoded_bytes());
    // SAFETY: getuid cannot fail and touches no memory.
    let uid = unsafe { libc::getuid() };
    let name = format!("kroma-{uid}-{}", &hex::encode(digest)[..12]);
    Some(Path::new("/tmp").join(name))
}

#[cfg(not(unix))]
fn short_root(_data_dir: &Path) -> Option<PathBuf> {
    None
}

#[cfg(unix)]
fn private_dir(dir: &Path) -> io::Result<()> {
    use std::os::unix::fs::{DirBuilderExt, MetadataExt, PermissionsExt};
    std::fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(dir)?;
    let meta = std::fs::symlink_metadata(dir)?;
    // SAFETY: getuid cannot fail and touches no memory.
    let uid = unsafe { libc::getuid() };
    if !meta.is_dir() || meta.uid() != uid {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            format!("{} is not a directory this user owns", dir.display()),
        ));
    }
    if meta.mode() & 0o077 != 0 {
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

#[cfg(not(unix))]
fn private_dir(dir: &Path) -> io::Result<()> {
    std::fs::create_dir_all(dir)
}

#[cfg(all(test, unix))]
mod tests {
    use std::os::unix::fs::PermissionsExt;

    use super::*;

    fn mode(path: &Path) -> u32 {
        std::fs::metadata(path).unwrap().permissions().mode() & 0o777
    }

    #[test]
    fn a_shallow_data_dir_keeps_its_sockets_under_run() {
        let run = RunDir::for_data_dir(Path::new("/data"));

        assert_eq!(run.host_socket(), Path::new("/data/run/host.sock"));
        assert_eq!(run.root, Path::new("/data/run"));
    }

    #[test]
    fn a_data_dir_too_deep_for_a_socket_moves_them_to_a_short_private_one() {
        let deep = Path::new("/").join("d".repeat(90));

        let run = RunDir::for_data_dir(&deep);

        assert!(run.root.starts_with("/tmp"), "{}", run.root.display());
        assert!(fits(&RunDir::socket_in(&run.root, &"m".repeat(ID_ROOM))));
        assert_eq!(
            RunDir::for_data_dir(&deep).root,
            run.root,
            "stable per data dir"
        );
    }

    #[test]
    fn a_module_socket_lives_in_a_directory_only_this_user_opens() {
        let dir = kroma_testing::temp_dir("run-dir");
        let run = RunDir {
            root: dir.path().join("run"),
        };

        let socket = run.prepare_module("a.b").unwrap();

        assert_eq!(socket, dir.path().join("run/modules/a.b/module.sock"));
        for private in [run.root.clone(), socket.parent().unwrap().into()] {
            assert_eq!(mode(&private), 0o700, "{}", private.display());
        }
    }

    #[test]
    fn a_socket_left_by_a_previous_run_is_cleared_before_the_next_bind() {
        let dir = kroma_testing::temp_dir("run-stale");
        let run = RunDir {
            root: dir.path().join("run"),
        };
        let stale = run.prepare_host().unwrap();
        let _held = std::os::unix::net::UnixListener::bind(&stale).unwrap();

        let again = run.prepare_host().unwrap();

        assert!(!again.exists());
        assert!(std::os::unix::net::UnixListener::bind(&again).is_ok());
    }

    #[test]
    fn a_directory_left_open_to_others_is_closed_before_it_is_used() {
        let dir = kroma_testing::temp_dir("run-open");
        let root = dir.path().join("run");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o777)).unwrap();
        let run = RunDir { root: root.clone() };

        run.prepare_host().unwrap();

        assert_eq!(mode(&root), 0o700);
    }

    #[test]
    fn an_id_too_long_for_any_socket_address_is_refused_with_the_reason() {
        let dir = kroma_testing::temp_dir("run-long");
        let run = RunDir {
            root: dir.path().join("run"),
        };

        let err = run.prepare_module(&"x".repeat(120)).unwrap_err();

        assert!(err.to_string().contains("Unix socket address"), "{err}");
    }

    #[test]
    fn forgetting_a_module_takes_its_directory_with_it() {
        let dir = kroma_testing::temp_dir("run-forget");
        let run = RunDir {
            root: dir.path().join("run"),
        };
        let socket = run.prepare_module("a.b").unwrap();

        run.forget_module("a.b");

        assert!(!socket.parent().unwrap().exists());
    }
}
