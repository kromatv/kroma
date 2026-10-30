//! Self-provisioning of the `cloudflared` binary the connector runs.
//!
//! On first enable the server downloads the pinned `cloudflared` release for its
//! platform into `<data_dir>/bin` through `Fetch` (the same HTTP path as the rest
//! of the server). The download is checked against the sha256 pinned in [`pins`]
//! before it is unpacked or run, and validated by running `--version` before it
//! is accepted. A cached copy is trusted only if it came from that pinned
//! download.

pub(crate) mod pins;

use std::path::{Path, PathBuf};

use kroma_module_sdk::http::Fetch;
use kroma_module_sdk::primitives::sha256_file;
use tokio::process::Command;

use pins::{Asset, VERSION};

const RELEASE: &str = "https://github.com/cloudflare/cloudflared/releases/download";
const DOWNLOAD_MAX_SECS: u32 = 180;

/// The cached binary's file name.
pub fn bin_name() -> &'static str {
    if cfg!(windows) {
        "cloudflared.exe"
    } else {
        "cloudflared"
    }
}

/// Where a self-provisioned copy lives.
pub fn cached_path(data_dir: &Path) -> PathBuf {
    data_dir.join("bin").join(bin_name())
}

pub(crate) fn sha256_path(data_dir: &Path) -> PathBuf {
    data_dir.join("bin").join("cloudflared.sha256")
}

/// The self-provisioned copy, if it came from the pinned download.
pub fn cached_binary(data_dir: &Path) -> Option<PathBuf> {
    cached_matching(data_dir, pins::asset()?)
}

fn cached_matching(data_dir: &Path, asset: &Asset) -> Option<PathBuf> {
    let path = cached_path(data_dir);
    let recorded = std::fs::read_to_string(sha256_path(data_dir)).ok()?;
    (path.is_file() && recorded.trim() == asset.sha256).then_some(path)
}

async fn verify(download: &Path, asset: &Asset) -> Result<(), String> {
    let path = download.to_path_buf();
    let digest = tokio::task::spawn_blocking(move || sha256_file(&path)).await;
    if matches!(&digest, Ok(Ok(actual)) if actual == asset.sha256) {
        return Ok(());
    }
    let _ = tokio::fs::remove_file(download).await;
    Err(format!("{} does not match its pinned sha256", asset.name))
}

/// Download + install the pinned cloudflared into `<data_dir>/bin`, returning
/// its path. The download must match its pinned sha256 and the result must run
/// `--version`; otherwise it is rejected and removed.
pub async fn download(data_dir: &Path) -> Result<PathBuf, String> {
    let asset = pins::asset().ok_or_else(|| {
        format!(
            "no cloudflared build for {}/{}",
            std::env::consts::OS,
            std::env::consts::ARCH
        )
    })?;
    let bindir = data_dir.join("bin");
    tokio::fs::create_dir_all(&bindir)
        .await
        .map_err(|e| format!("create bin dir: {e}"))?;
    let dest = bindir.join(bin_name());
    let tmp = bindir.join(format!("cloudflared.download.{}", std::process::id()));
    let url = format!("{RELEASE}/{VERSION}/{}", asset.name);

    let ok = fetch_release(url.clone(), tmp.clone()).await;
    if !ok {
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(format!("download failed: {url}"));
    }
    verify(&tmp, asset).await?;

    if asset.archive {
        let extracted = Command::new("tar")
            .arg("-xzf")
            .arg(&tmp)
            .arg("-C")
            .arg(&bindir)
            .arg("cloudflared")
            .status()
            .await
            .map(|s| s.success())
            .unwrap_or(false);
        let _ = tokio::fs::remove_file(&tmp).await;
        if !extracted {
            return Err("failed to extract cloudflared archive".to_string());
        }
    } else {
        tokio::fs::rename(&tmp, &dest)
            .await
            .map_err(|e| format!("install cloudflared: {e}"))?;
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
        return Err("downloaded cloudflared is not runnable".to_string());
    }
    let _ = tokio::fs::write(sha256_path(data_dir), asset.sha256).await;
    Ok(dest)
}

async fn fetch_release(url: String, dest: PathBuf) -> bool {
    tokio::task::spawn_blocking(move || {
        Fetch::new()
            .purpose("binary-download")
            .max_time(DOWNLOAD_MAX_SECS)
            .download(&url, &dest)
    })
    .await
    .is_ok_and(|fetched| fetched.is_ok_and(|response| (200..300).contains(&response.status)))
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
            name: "cloudflared-test",
            archive: false,
            sha256: ABC_SHA256,
        }
    }

    fn cache(data_dir: &Path, record: Option<&str>) {
        std::fs::create_dir_all(cached_path(data_dir).parent().unwrap()).unwrap();
        std::fs::write(cached_path(data_dir), "binary").unwrap();
        if let Some(record) = record {
            std::fs::write(sha256_path(data_dir), record).unwrap();
        }
    }

    #[tokio::test]
    async fn accepts_a_download_that_matches_its_pin() {
        let dir = temp_dir("cloudflared-verify");
        let download = dir.path().join("download");
        std::fs::write(&download, "abc").unwrap();

        let verdict = verify(&download, &pinned_to_abc()).await;

        assert!(verdict.is_ok());
        assert!(download.exists());
    }

    #[tokio::test]
    async fn rejects_and_removes_a_download_with_other_bytes() {
        let dir = temp_dir("cloudflared-verify");
        let download = dir.path().join("download");
        std::fs::write(&download, "abd").unwrap();

        let verdict = verify(&download, &pinned_to_abc()).await;

        assert!(verdict.unwrap_err().contains("cloudflared-test"));
        assert!(!download.exists());
    }

    #[tokio::test]
    async fn rejects_and_removes_a_truncated_download() {
        let dir = temp_dir("cloudflared-verify");
        let download = dir.path().join("download");
        std::fs::write(&download, "ab").unwrap();

        let verdict = verify(&download, &pinned_to_abc()).await;

        assert!(verdict.is_err());
        assert!(!download.exists());
    }

    #[test]
    fn reuses_a_binary_recorded_as_the_pinned_download() {
        let dir = temp_dir("cloudflared-cache");
        cache(dir.path(), Some(ABC_SHA256));

        let reused = cached_matching(dir.path(), &pinned_to_abc());

        assert_eq!(reused, Some(cached_path(dir.path())));
    }

    #[test]
    fn distrusts_a_binary_recorded_as_another_download() {
        let dir = temp_dir("cloudflared-cache");
        cache(dir.path(), Some("2025.1.0"));

        let reused = cached_matching(dir.path(), &pinned_to_abc());

        assert_eq!(reused, None);
    }

    #[test]
    fn distrusts_a_binary_with_no_record_of_where_it_came_from() {
        let dir = temp_dir("cloudflared-cache");
        cache(dir.path(), None);

        let reused = cached_matching(dir.path(), &pinned_to_abc());

        assert_eq!(reused, None);
    }
}
