//! Self-provisioning of the `wireproxy` binary (userspace WireGuard exposing a
//! SOCKS5 proxy). Releases from github.com/windtf/wireproxy are tarballs named
//! `wireproxy_<os>_<arch>.tar.gz` holding one `wireproxy`. Each archive is
//! checked against the sha256 pinned beside [`VERSION`] before it is unpacked.

use std::path::{Path, PathBuf};

use kroma_module_sdk::primitives::sha256_file;
use tokio::process::Command;

// Never track `latest`: an upstream change (e.g. v1.1.3's SNI-proxy rework) can
// break the opaque BitTorrent TCP the bridge carries while HTTPS keeps working,
// which looks like "VPN green but downloads dead". Bump only after verifying
// peer flows (`cargo run -p kroma-torrent --example engine_probe --features rqbit`).
const VERSION: &str = "v1.1.2";
const RELEASE: &str = "https://github.com/windtf/wireproxy/releases/download";

pub(crate) fn cached_path(data_dir: &Path) -> PathBuf {
    data_dir.join("bin").join("wireproxy")
}

pub(crate) fn sha256_path(data_dir: &Path) -> PathBuf {
    data_dir.join("bin").join("wireproxy.sha256")
}

pub(crate) struct Asset {
    os: &'static str,
    arch: &'static str,
    name: &'static str,
    pub(crate) sha256: &'static str,
}

const ASSETS: &[Asset] = &[
    Asset {
        os: "linux",
        arch: "x86_64",
        name: "wireproxy_linux_amd64.tar.gz",
        sha256: "b7dcff8f6e9d3410364e432aff24154eaa8db8206e0c6faac35d6c6ab06dac51",
    },
    Asset {
        os: "linux",
        arch: "aarch64",
        name: "wireproxy_linux_arm64.tar.gz",
        sha256: "aa234db9ef0b2774cb04a79f391bd41c2ededd815fc1a1c720cfdc693c70898d",
    },
    Asset {
        os: "linux",
        arch: "arm",
        name: "wireproxy_linux_arm.tar.gz",
        sha256: "6d3c8c803a7fdeef6083d7f98b960e40925ab0139a138c3c991e1ca55cd8535e",
    },
    Asset {
        os: "macos",
        arch: "x86_64",
        name: "wireproxy_darwin_amd64.tar.gz",
        sha256: "044db5c94e1558845f793542f26d490a369f50b422c0b5d6f59f341e0d498b68",
    },
    Asset {
        os: "macos",
        arch: "aarch64",
        name: "wireproxy_darwin_arm64.tar.gz",
        sha256: "30c6cd19221f1fc37c6c0ccf4efedb8c727d358846463c8f68b8b9931eefe35a",
    },
];

pub(crate) fn asset() -> Option<&'static Asset> {
    ASSETS
        .iter()
        .find(|a| a.os == std::env::consts::OS && a.arch == std::env::consts::ARCH)
}

async fn cached(data_dir: &Path, asset: &Asset) -> Option<PathBuf> {
    let dest = cached_path(data_dir);
    let recorded = tokio::fs::read_to_string(sha256_path(data_dir))
        .await
        .ok()?;
    (dest.exists() && recorded.trim() == asset.sha256).then_some(dest)
}

/// Downloads the pinned release unless the cached binary was unpacked from it.
pub async fn ensure(data_dir: &Path) -> Result<PathBuf, String> {
    let asset = asset().ok_or_else(|| {
        format!(
            "no wireproxy build for {}/{}",
            std::env::consts::OS,
            std::env::consts::ARCH
        )
    })?;
    if let Some(dest) = cached(data_dir, asset).await {
        return Ok(dest);
    }
    if cached_path(data_dir).exists() {
        tracing::info!(
            pinned = VERSION,
            "re-provisioning wireproxy: the cached copy is not the verified pinned release"
        );
    }
    download(data_dir, asset).await
}

async fn verify(archive: &Path, asset: &Asset) -> Result<(), String> {
    let path = archive.to_path_buf();
    let digest = tokio::task::spawn_blocking(move || sha256_file(&path)).await;
    if matches!(&digest, Ok(Ok(actual)) if actual == asset.sha256) {
        return Ok(());
    }
    let _ = tokio::fs::remove_file(archive).await;
    Err(format!("{} does not match its pinned sha256", asset.name))
}

async fn download(data_dir: &Path, asset: &Asset) -> Result<PathBuf, String> {
    let bindir = data_dir.join("bin");
    tokio::fs::create_dir_all(&bindir)
        .await
        .map_err(|e| format!("create bin dir: {e}"))?;
    let dest = cached_path(data_dir);
    let tmp = bindir.join(format!("wireproxy.download.{}", std::process::id()));
    let url = format!("{RELEASE}/{VERSION}/{}", asset.name);

    let ok = Command::new("curl")
        .args(["-fSL", "--max-time", "180", "-o"])
        .arg(&tmp)
        .arg(&url)
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false);
    if !ok {
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(format!("download failed: {url}"));
    }
    verify(&tmp, asset).await?;

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
    let _ = tokio::fs::remove_file(&tmp).await;
    if !extracted {
        return Err("failed to extract wireproxy archive".to_string());
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = tokio::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o700)).await;
    }

    let runs = Command::new(&dest)
        .arg("--version")
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false);
    if !runs {
        let _ = tokio::fs::remove_file(&dest).await;
        return Err("downloaded wireproxy is not runnable".to_string());
    }
    let _ = tokio::fs::write(sha256_path(data_dir), asset.sha256).await;
    Ok(dest)
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::testing::temp_dir;

    use super::*;

    const ABC_SHA256: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    fn pinned_to_abc() -> Asset {
        Asset {
            os: "linux",
            arch: "x86_64",
            name: "wireproxy_test.tar.gz",
            sha256: ABC_SHA256,
        }
    }

    #[tokio::test]
    async fn accepts_an_archive_that_matches_its_pin() {
        let dir = temp_dir("wireproxy-verify");
        let archive = dir.path().join("archive");
        std::fs::write(&archive, "abc").unwrap();

        let verdict = verify(&archive, &pinned_to_abc()).await;

        assert!(verdict.is_ok());
        assert!(archive.exists());
    }

    #[tokio::test]
    async fn rejects_and_removes_an_archive_with_other_bytes() {
        let dir = temp_dir("wireproxy-verify");
        let archive = dir.path().join("archive");
        std::fs::write(&archive, "abd").unwrap();

        let verdict = verify(&archive, &pinned_to_abc()).await;

        assert!(verdict.unwrap_err().contains("wireproxy_test.tar.gz"));
        assert!(!archive.exists());
    }

    #[tokio::test]
    async fn rejects_and_removes_a_truncated_archive() {
        let dir = temp_dir("wireproxy-verify");
        let archive = dir.path().join("archive");
        std::fs::write(&archive, "ab").unwrap();

        let verdict = verify(&archive, &pinned_to_abc()).await;

        assert!(verdict.is_err());
        assert!(!archive.exists());
    }

    #[tokio::test]
    async fn reuses_a_binary_unpacked_from_the_pinned_archive() {
        let dir = temp_dir("wireproxy-cache");
        std::fs::create_dir_all(cached_path(dir.path()).parent().unwrap()).unwrap();
        std::fs::write(cached_path(dir.path()), "binary").unwrap();
        std::fs::write(sha256_path(dir.path()), ABC_SHA256).unwrap();

        let reused = cached(dir.path(), &pinned_to_abc()).await;

        assert_eq!(reused, Some(cached_path(dir.path())));
    }

    #[tokio::test]
    async fn replaces_a_binary_recorded_only_under_a_version_tag() {
        let dir = temp_dir("wireproxy-cache");
        std::fs::create_dir_all(cached_path(dir.path()).parent().unwrap()).unwrap();
        std::fs::write(cached_path(dir.path()), "binary").unwrap();
        std::fs::write(sha256_path(dir.path()), "v1.1.2").unwrap();

        let reused = cached(dir.path(), &pinned_to_abc()).await;

        assert_eq!(reused, None);
    }

    #[tokio::test]
    async fn replaces_a_binary_with_no_record_of_where_it_came_from() {
        let dir = temp_dir("wireproxy-cache");
        std::fs::create_dir_all(cached_path(dir.path()).parent().unwrap()).unwrap();
        std::fs::write(cached_path(dir.path()), "binary").unwrap();

        let reused = cached(dir.path(), &pinned_to_abc()).await;

        assert_eq!(reused, None);
    }

    #[test]
    fn pins_every_asset_to_a_lowercase_sha256() {
        for asset in ASSETS {
            assert_eq!(asset.sha256.len(), 64, "{}", asset.name);
            assert!(
                asset
                    .sha256
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
                "{}",
                asset.name
            );
        }
    }

    #[test]
    fn pins_each_platform_and_each_archive_once() {
        let platforms: std::collections::HashSet<_> =
            ASSETS.iter().map(|a| (a.os, a.arch)).collect();
        let names: std::collections::HashSet<_> = ASSETS.iter().map(|a| a.name).collect();

        assert_eq!(platforms.len(), ASSETS.len());
        assert_eq!(names.len(), ASSETS.len());
    }
}
