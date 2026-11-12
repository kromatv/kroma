//! `wireproxy` (userspace WireGuard exposing a SOCKS5 proxy). The manifest pins each
//! platform's build, and the host fetches and checks it: never track `latest`, as an
//! upstream change (v1.1.3's SNI-proxy rework) can break the opaque BitTorrent TCP the
//! bridge carries while HTTPS keeps working, which looks like "VPN green but downloads
//! dead". Bump only after verifying peer flows.

use std::path::Path;

/// The name `permissions.run` and `helpers` declare it under.
pub(crate) const PROGRAM: &str = "wireproxy";

/// Have the host fetch the pinned build, and answer what to start.
#[cfg(not(test))]
pub async fn ensure(_data_dir: &Path) -> Result<String, String> {
    use kroma_module_sdk::host::{process, run_blocking};

    run_blocking(|| process::ensure(PROGRAM))
        .await
        .map_err(|error| error.to_string())??;
    Ok(PROGRAM.to_string())
}

#[cfg(test)]
pub(crate) fn cached_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join("bin").join(PROGRAM)
}

#[cfg(test)]
pub async fn ensure(data_dir: &Path) -> Result<String, String> {
    Ok(cached_path(data_dir).to_string_lossy().into_owned())
}
