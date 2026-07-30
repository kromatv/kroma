//! Self-provisioning of the `wireproxy` binary (userspace WireGuard exposing a
//! SOCKS5 proxy). Releases from github.com/windtf/wireproxy are tarballs named
//! `wireproxy_<os>_<arch>.tar.gz` holding one `wireproxy`.

use std::path::{Path, PathBuf};

use tokio::process::Command;

// Never track `latest`: an upstream change (e.g. v1.1.3's SNI-proxy rework) can
// break the opaque BitTorrent TCP the bridge carries while HTTPS keeps working,
// which looks like "VPN green but downloads dead". Bump only after verifying
// peer flows (`cargo run -p kroma-torrent --example engine_probe --features rqbit`).
const VERSION: &str = "v1.1.2";
const RELEASE: &str = "https://github.com/windtf/wireproxy/releases/download";

fn cached_path(data_dir: &Path) -> PathBuf {
    data_dir.join("bin").join("wireproxy")
}

fn version_path(data_dir: &Path) -> PathBuf {
    data_dir.join("bin").join("wireproxy.version")
}

fn asset() -> Option<&'static str> {
    Some(match (std::env::consts::OS, std::env::consts::ARCH) {
        ("linux", "x86_64") => "wireproxy_linux_amd64.tar.gz",
        ("linux", "aarch64") => "wireproxy_linux_arm64.tar.gz",
        ("linux", "arm") => "wireproxy_linux_arm.tar.gz",
        ("macos", "x86_64") => "wireproxy_darwin_amd64.tar.gz",
        ("macos", "aarch64") => "wireproxy_darwin_arm64.tar.gz",
        _ => return None,
    })
}

/// Downloads the pinned release on first use, or whenever the cached binary is
/// from a different one.
pub async fn ensure(data_dir: &Path) -> Result<PathBuf, String> {
    let dest = cached_path(data_dir);
    let cached_version = std::fs::read_to_string(version_path(data_dir)).unwrap_or_default();
    if dest.exists() && cached_version.trim() == VERSION {
        return Ok(dest);
    }
    if dest.exists() {
        tracing::info!(
            cached = %if cached_version.trim().is_empty() { "unpinned" } else { cached_version.trim() },
            pinned = VERSION,
            "re-provisioning wireproxy to the pinned release"
        );
    }
    download(data_dir).await
}

async fn download(data_dir: &Path) -> Result<PathBuf, String> {
    let asset = asset().ok_or_else(|| {
        format!("no wireproxy build for {}/{}", std::env::consts::OS, std::env::consts::ARCH)
    })?;
    let bindir = data_dir.join("bin");
    std::fs::create_dir_all(&bindir).map_err(|e| format!("create bin dir: {e}"))?;
    let dest = cached_path(data_dir);
    let tmp = bindir.join(format!("wireproxy.download.{}", std::process::id()));
    let url = format!("{RELEASE}/{VERSION}/{asset}");

    let ok = Command::new("curl")
        .args(["-fSL", "--max-time", "180", "-o"])
        .arg(&tmp)
        .arg(&url)
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false);
    if !ok {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("download failed: {url}"));
    }

    let extracted = Command::new("tar")
        .arg("-xzf")
        .arg(&tmp)
        .arg("-C")
        .arg(&bindir)
        .arg("wireproxy")
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false);
    let _ = std::fs::remove_file(&tmp);
    if !extracted {
        return Err("failed to extract wireproxy archive".to_string());
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755));
    }

    let runs = Command::new(&dest)
        .arg("--version")
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false);
    if !runs {
        let _ = std::fs::remove_file(&dest);
        return Err("downloaded wireproxy is not runnable".to_string());
    }
    let _ = std::fs::write(version_path(data_dir), VERSION);
    Ok(dest)
}
