use std::path::{Path, PathBuf};

use tokio::process::Child;

fn pidfile(dir: &Path) -> PathBuf {
    dir.join("wireproxy.pid")
}

// Remember the bridge child's pid so the NEXT process generation can reap it
// if this one dies without cleanup (SIGKILL from the supervisor).
pub(crate) fn record_pid(dir: &Path, child: &Child) {
    if let Some(pid) = child.id() {
        let _ = std::fs::write(pidfile(dir), pid.to_string());
    }
}

/// Kill a wireproxy orphaned by a previous run, identified by the pidfile and
/// verified by process name (never kill a reused pid). Best-effort.
///
/// A stale bridge keeps the SOCKS port bound with an outdated config, so
/// skipping this both fails every fresh spawn with "address in use" and leaves
/// traffic silently riding the old tunnel.
#[cfg(unix)]
pub(crate) fn reap_stale(dir: &Path) {
    let path = pidfile(dir);
    let Some(pid) = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| s.trim().parse::<u32>().ok())
    else {
        return;
    };
    let _ = std::fs::remove_file(&path);
    let comm = std::process::Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "comm="])
        .output();
    let is_wireproxy = comm.is_ok_and(|o| String::from_utf8_lossy(&o.stdout).contains("wireproxy"));
    if is_wireproxy {
        tracing::warn!(pid, "killing a stale wireproxy from a previous run");
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .status();
    }
}

#[cfg(not(unix))]
pub(crate) fn reap_stale(_dir: &Path) {}

pub(crate) fn spawn_child(bin: &Path, conf: &Path) -> Result<Child, String> {
    let mut busy = 0;
    loop {
        let spawned = tokio::process::Command::new(bin)
            .arg("-c")
            .arg(conf)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
        match spawned {
            Err(e) if e.kind() == std::io::ErrorKind::ExecutableFileBusy && busy < 10 => {
                busy += 1;
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            spawned => return spawned.map_err(|e| format!("spawn wireproxy: {e}")),
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::test_support::{install_script, RUNNING};
    use kroma_module_sdk::host::testing::StubHost;
    use kroma_module_sdk::host::HostCtx;

    #[tokio::test]
    async fn spawn_child_fails_on_a_missing_binary() {
        let host = StubHost::new();
        let dir = host.data_dir().to_path_buf();

        let result = spawn_child(&dir.join("absent"), &dir.join("wireproxy.conf"));

        assert!(result.unwrap_err().starts_with("spawn wireproxy:"));
    }

    #[tokio::test]
    async fn record_pid_writes_the_childs_pid_beside_the_config() {
        let host = StubHost::new();
        let dir = host.data_dir().to_path_buf();
        let bin = install_script(&dir, RUNNING);
        let mut child = spawn_child(&bin, &dir.join("wireproxy.conf")).unwrap();

        record_pid(&dir, &child);

        let recorded = std::fs::read_to_string(pidfile(&dir)).unwrap();
        assert_eq!(recorded, child.id().unwrap().to_string());
        child.kill().await.unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn spawns_a_binary_that_was_still_open_for_writing_a_moment_ago() {
        let host = StubHost::new();
        let dir = host.data_dir().to_path_buf();
        let bin = install_script(&dir, RUNNING);
        let writer = std::fs::OpenOptions::new().append(true).open(&bin).unwrap();
        let release = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(50));
            drop(writer);
        });

        let mut child = spawn_child(&bin, &dir.join("wireproxy.conf")).unwrap();

        release.join().unwrap();
        child.kill().await.unwrap();
    }

    #[test]
    fn reap_stale_without_a_pidfile_does_nothing() {
        let host = StubHost::new();

        reap_stale(host.data_dir());

        assert!(!pidfile(host.data_dir()).exists());
    }

    #[test]
    fn reap_stale_drops_an_unparsable_pidfile_untouched() {
        let host = StubHost::new();
        std::fs::write(pidfile(host.data_dir()), "not a pid").unwrap();

        reap_stale(host.data_dir());

        assert!(pidfile(host.data_dir()).exists());
    }

    #[test]
    fn reap_stale_removes_the_pidfile_but_spares_a_process_that_is_not_wireproxy() {
        let host = StubHost::new();
        std::fs::write(pidfile(host.data_dir()), std::process::id().to_string()).unwrap();

        reap_stale(host.data_dir());

        assert!(!pidfile(host.data_dir()).exists());
    }
}
