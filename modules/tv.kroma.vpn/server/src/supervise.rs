use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::backoff::Backoff;
use crate::bridge::Bridge;
use crate::process::spawn_child;
use crate::stderr_tail::StderrTail;

const POLL: Duration = Duration::from_secs(3);

#[derive(Debug, PartialEq, Eq)]
enum Watch {
    Gone,
    Running,
    Exited(Option<i32>),
}

impl Bridge {
    /// While `generation` is the active config, respawn the child whenever it
    /// dies, waiting longer each time it dies young. The kill switch covers the
    /// gap. Respawns re-run the child directly, never `apply`.
    pub(crate) fn supervise(self: Arc<Self>, generation: u64, bin: String, conf_path: PathBuf) {
        let me = self;
        tokio::spawn(async move {
            let mut backoff = Backoff::default();
            let mut started = Instant::now();
            let mut stderr = StderrTail::default();
            loop {
                tokio::time::sleep(POLL).await;
                if !me.is_current(generation) {
                    return;
                }
                let code = match me.watch(&mut stderr).await {
                    Watch::Gone => return,
                    Watch::Running => continue,
                    Watch::Exited(code) => code,
                };
                let ran = started.elapsed();
                let retry = backoff.after(ran);
                tracing::warn!(
                    code = ?code,
                    ran_secs = ran.as_secs(),
                    retry_in_secs = retry.as_secs(),
                    stderr = %stderr.last_lines(),
                    "wireguard bridge exited; restarting"
                );
                stderr = StderrTail::default();
                tokio::time::sleep(retry).await;
                if !me.respawn(generation, &bin, &conf_path).await {
                    return;
                }
                started = Instant::now();
            }
        });
    }

    async fn watch(&self, stderr: &mut StderrTail) -> Watch {
        let guard = self.child.lock().await;
        let Some(child) = guard.as_ref() else {
            return Watch::Gone;
        };
        let exited = child.try_wait();
        stderr.drain(child);
        match exited {
            Ok(None) => Watch::Running,
            Ok(Some(code)) => Watch::Exited(Some(code)),
            Err(_) => Watch::Exited(None),
        }
    }

    /// Whether the supervisor should keep watching: false once this generation
    /// is no longer the active config.
    async fn respawn(
        &self,
        generation: u64,
        bin: &str,
        conf: &std::path::Path,
    ) -> bool {
        if !self.is_current(generation) {
            return false;
        }
        match spawn_child(bin, conf) {
            Ok(child) => {
                let mut guard = self.child.lock().await;
                // Re-check under the lock: a `stop` between the check above and
                // here took a `None` child, so storing this one would leave it
                // tunnelling with nothing left holding a handle to kill it.
                if !self.is_current(generation) {
                    child.kill();
                    return false;
                }
                *guard = Some(child);
                true
            }
            Err(e) => {
                tracing::warn!(error = %e, "wireguard bridge restart failed");
                true
            }
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use std::sync::atomic::Ordering;

    use super::Watch;
    use crate::stderr_tail::StderrTail;
    use crate::test_support::{bridge_for, eventually, install_script, EXITING, RUNNING};
    use kroma_module_sdk::host::testing::StubHost;
    use kroma_module_sdk::host::HostCtx;

    async fn pid_of(vpn: &crate::bridge::Bridge) -> Option<u64> {
        vpn.child.lock().await.as_ref().map(|c| c.id())
    }

    #[tokio::test]
    async fn watching_without_a_child_finds_it_gone() {
        let host = StubHost::new();
        let vpn = bridge_for(&host);

        assert_eq!(vpn.watch(&mut StderrTail::default()).await, Watch::Gone);
    }

    #[tokio::test]
    async fn watching_reports_a_live_and_an_exited_child() {
        let host = StubHost::new();
        let vpn = bridge_for(&host);
        let live = install_script(host.data_dir(), RUNNING);
        *vpn.child.lock().await = Some(crate::process::spawn_child(live.to_str().unwrap(), &live).unwrap());
        assert_eq!(vpn.watch(&mut StderrTail::default()).await, Watch::Running);
        vpn.child.lock().await.take().unwrap().kill();
        let gone = install_script(host.data_dir(), EXITING);
        *vpn.child.lock().await = Some(crate::process::spawn_child(gone.to_str().unwrap(), &gone).unwrap());

        eventually(|| async {
            vpn.watch(&mut StderrTail::default()).await == Watch::Exited(Some(3))
        })
        .await;
    }

    #[tokio::test]
    async fn an_exited_child_leaves_what_it_wrote_to_stderr() {
        let host = StubHost::new();
        let vpn = bridge_for(&host);
        let bin = install_script(
            host.data_dir(),
            "#!/bin/sh\necho 'listen tcp 127.0.0.1:25999: bind: address already in use' >&2\nexit 1\n",
        );
        let child = crate::process::spawn_child(bin.to_str().unwrap(), &bin).unwrap();
        *vpn.child.lock().await = Some(child.clone());
        child.wait().await.unwrap();
        let mut stderr = StderrTail::default();

        let watched = vpn.watch(&mut stderr).await;

        assert_eq!(watched, Watch::Exited(Some(1)));
        assert_eq!(
            stderr.last_lines(),
            "listen tcp 127.0.0.1:25999: bind: address already in use"
        );
    }

    #[tokio::test]
    async fn respawn_refuses_a_stale_generation() {
        let host = StubHost::new();
        let vpn = bridge_for(&host);
        let bin = install_script(host.data_dir(), RUNNING);
        vpn.generation.store(2, Ordering::SeqCst);

        let keep_watching = vpn.respawn(1, bin.to_str().unwrap(), &bin).await;

        assert!(!keep_watching);
        assert_eq!(pid_of(&vpn).await, None);
    }

    #[tokio::test]
    async fn respawn_stores_the_new_child() {
        let host = StubHost::new();
        let vpn = bridge_for(&host);
        let bin = install_script(host.data_dir(), RUNNING);
        std::fs::create_dir_all(&vpn.dir).unwrap();

        let keep_watching = vpn.respawn(0, bin.to_str().unwrap(), &bin).await;

        assert!(keep_watching);
        assert!(pid_of(&vpn).await.is_some());
        vpn.child.lock().await.take().unwrap().kill();
    }

    #[tokio::test]
    async fn respawn_keeps_watching_when_the_binary_fails_to_spawn() {
        let host = StubHost::new();
        let vpn = bridge_for(&host);
        let missing = host.data_dir().join("absent");

        let keep_watching = vpn.respawn(0, missing.to_str().unwrap(), &missing).await;

        assert!(keep_watching);
        assert_eq!(pid_of(&vpn).await, None);
    }

    #[tokio::test]
    async fn the_supervisor_restarts_a_child_that_exited() {
        let host = StubHost::new();
        let vpn = bridge_for(&host);
        let bin = install_script(host.data_dir(), EXITING);
        std::fs::create_dir_all(&vpn.dir).unwrap();
        let first = crate::process::spawn_child(bin.to_str().unwrap(), &bin).unwrap();
        let first_pid = Some(first.id());
        *vpn.child.lock().await = Some(first);

        vpn.clone().supervise(0, bin.to_string_lossy().into_owned(), bin);

        eventually(|| async { pid_of(&vpn).await != first_pid }).await;
        vpn.generation.store(1, Ordering::SeqCst);
    }
}
