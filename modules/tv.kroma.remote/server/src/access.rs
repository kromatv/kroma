use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use serde::Serialize;
use tokio::process::Child;
use tokio::sync::Mutex;
use tracing::info;

use crate::process::binary_version;
use crate::provision;

const LOG_CAP: usize = 200;

#[derive(Default)]
pub(crate) struct Inner {
    pub(crate) child: Option<Child>,
    pub(crate) logs: VecDeque<String>,
    pub(crate) running: bool,
    pub(crate) starting: bool,
    pub(crate) since: Option<String>,
    pub(crate) last_error: Option<String>,
}

/// Supervised `cloudflared` connector, held once in [`crate::state::AppState`].
pub struct RemoteAccess {
    pub(crate) inner: Mutex<Inner>,
    pub(crate) data_dir: PathBuf,
    // Latched by `shutdown` so a reconcile - or a launch already in flight -
    // can't bring the connector back up while the module is going down.
    pub(crate) stopping: AtomicBool,
    // One reconcile loop per process, however often `spawn_boot` is called.
    pub(crate) watching: AtomicBool,
}

/// Snapshot for the admin panel. Never carries the token.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteStatus {
    pub running: bool,
    pub connecting: bool,
    pub since: Option<String>,
    pub last_error: Option<String>,
    pub binary_found: bool,
    pub binary_version: Option<String>,
    pub logs: Vec<String>,
}

impl RemoteAccess {
    pub fn new(data_dir: PathBuf) -> Arc<Self> {
        Arc::new(Self {
            inner: Mutex::new(Inner::default()),
            data_dir,
            stopping: AtomicBool::new(false),
            watching: AtomicBool::new(false),
        })
    }

    // Resolution order: packaged next to the server executable, a copy cached
    // under `<data_dir>/bin`, then `cloudflared` from `PATH` (dev fallback).
    // Never an admin-configured path.
    pub(crate) fn resolve_binary(&self) -> String {
        let name = provision::bin_name();
        if let Ok(exe) = std::env::current_exe() {
            if let Some(p) = exe.parent().map(|d| d.join(name)) {
                if p.is_file() {
                    return p.to_string_lossy().into_owned();
                }
            }
        }
        let cached = provision::cached_path(&self.data_dir);
        if cached.is_file() {
            return cached.to_string_lossy().into_owned();
        }
        name.to_string()
    }

    // Downloads + caches a runnable `cloudflared` under the data dir if the
    // server doesn't already provide one. Called from the background launch
    // task, so a multi-MB download never blocks a request.
    pub(crate) async fn ensure_binary(&self) -> Result<String, String> {
        let bin = self.resolve_binary();
        if std::path::Path::new(&bin).is_absolute() {
            return Ok(bin);
        }
        if binary_version(&bin).await.is_some() {
            return Ok(bin);
        }
        self.push_log("cloudflared not found, downloading…".to_string())
            .await;
        info!("remote access: downloading cloudflared");
        let path = provision::download(&self.data_dir).await?;
        self.push_log(format!("cloudflared installed at {}", path.display()))
            .await;
        info!("remote access: cloudflared installed at {}", path.display());
        Ok(path.to_string_lossy().into_owned())
    }

    pub(crate) async fn push_log(&self, line: String) {
        let mut g = self.inner.lock().await;
        if g.logs.len() >= LOG_CAP {
            g.logs.pop_front();
        }
        g.logs.push_back(line);
    }

    /// Current status snapshot for the admin panel (binary probe included).
    pub async fn status(&self) -> RemoteStatus {
        let (running, connecting) = {
            let mut g = self.inner.lock().await;
            if let Some(child) = g.child.as_mut() {
                if let Ok(Some(status)) = child.try_wait() {
                    g.running = false;
                    g.child = None;
                    g.last_error = Some(format!("cloudflared exited ({status})"));
                }
            }
            (g.running, g.starting)
        };
        let version = binary_version(&self.resolve_binary()).await;
        let g = self.inner.lock().await;
        RemoteStatus {
            running,
            connecting,
            since: g.since.clone(),
            last_error: g.last_error.clone(),
            binary_found: version.is_some(),
            binary_version: version,
            logs: g.logs.iter().cloned().collect(),
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use kroma_module_sdk::host::HostCtx;

    use super::*;

    use crate::test_support::{
        eventually, host, install_inert_file, install_script, remote_for, RUNNING,
    };

    #[test]
    fn prefers_the_cached_copy_over_the_path_lookup() {
        let host = host();
        let remote = remote_for(&host);
        let cached = install_script(host.data_dir(), RUNNING);

        let resolved = remote.resolve_binary();

        assert_eq!(resolved, cached.to_string_lossy());
    }

    #[test]
    fn falls_back_to_the_bare_binary_name_when_nothing_is_cached() {
        let host = host();
        let remote = remote_for(&host);

        let resolved = remote.resolve_binary();

        assert_eq!(resolved, provision::bin_name());
    }

    #[tokio::test]
    async fn keeps_an_absolute_binary_without_downloading() {
        let host = host();
        let remote = remote_for(&host);
        let cached = install_script(host.data_dir(), RUNNING);

        let bin = remote.ensure_binary().await.unwrap();

        assert_eq!(bin, cached.to_string_lossy());
    }

    #[tokio::test]
    async fn keeps_only_the_newest_log_lines() {
        let host = host();
        let remote = remote_for(&host);
        for i in 0..(LOG_CAP + 5) {
            remote.push_log(format!("line {i}")).await;
        }

        let status = remote.status().await;

        assert_eq!(status.logs.len(), LOG_CAP);
        assert_eq!(status.logs.first().map(String::as_str), Some("line 5"));
    }

    #[tokio::test]
    async fn reports_the_binary_version_and_an_idle_connector() {
        let host = host();
        let remote = remote_for(&host);
        install_script(host.data_dir(), RUNNING);

        let status = remote.status().await;

        assert!(status.binary_found);
        assert_eq!(
            status.binary_version.as_deref(),
            Some("cloudflared version 2024.1.0")
        );
        assert!(!status.running && !status.connecting);
        assert!(status.since.is_none() && status.last_error.is_none());
    }

    #[tokio::test]
    async fn reports_a_missing_binary() {
        let host = host();
        let remote = remote_for(&host);
        install_inert_file(host.data_dir());

        eventually(|| async { !remote.status().await.binary_found }).await;
    }
}
