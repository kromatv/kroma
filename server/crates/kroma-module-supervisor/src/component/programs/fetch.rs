use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::PoisonError;

use kroma_http::egress::Gateway;
use kroma_http::Fetch;
use kroma_module_manifest::{Helper, HelperAsset};
use sha2::{Digest, Sha256};

use super::Programs;

const DOWNLOAD_PURPOSE: &str = "binary-download";
const DOWNLOAD_MAX_SECS: u32 = 600;

pub(super) fn platform() -> String {
    format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

pub(super) fn on_path(program: &str) -> Option<PathBuf> {
    std::env::split_paths(&std::env::var_os("PATH")?)
        .map(|dir| dir.join(program))
        .find(|candidate| candidate.is_file())
}

pub(super) fn sha256_of(path: &Path) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut digest = Sha256::new();
    let mut chunk = vec![0_u8; 1024 * 1024];
    loop {
        let read = file.read(&mut chunk)?;
        if read == 0 {
            return Ok(hex::encode(digest.finalize()));
        }
        digest.update(&chunk[..read]);
    }
}

fn take_member(archive: &Path, member: &str, destination: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive).map_err(|error| error.to_string())?;
    let mut entries = tar::Archive::new(flate2::read::GzDecoder::new(file));
    let found = entries.entries().map_err(|error| error.to_string())?;
    for entry in found {
        let mut entry = entry.map_err(|error| error.to_string())?;
        let is_it = entry
            .path()
            .ok()
            .and_then(|path| path.file_name().map(|name| name == member))
            .unwrap_or(false);
        if is_it {
            let mut out = std::fs::File::create(destination).map_err(|error| error.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|error| error.to_string())?;
            return Ok(());
        }
    }
    Err(format!("the archive holds no {member}"))
}

pub(super) fn make_executable(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
}

impl Programs {
    pub(super) fn fetch_helper(&self, program: &str, asset: &HelperAsset) -> Result<PathBuf, String> {
        let destination = self.helpers_dir.join(program);
        let pin = self.helpers_dir.join(format!("{program}.sha256"));
        let _one_at_a_time = self.fetching.lock().unwrap_or_else(PoisonError::into_inner);
        let recorded = std::fs::read_to_string(&pin).unwrap_or_default();
        if destination.is_file() && recorded.trim() == asset.sha256 {
            return Ok(destination);
        }
        std::fs::create_dir_all(&self.helpers_dir).map_err(|error| error.to_string())?;
        let download = self.helpers_dir.join(format!("{program}.download"));
        let username = Gateway::username(DOWNLOAD_PURPOSE, false, false);
        let response = Fetch::new()
            .purpose(DOWNLOAD_PURPOSE)
            .max_time(DOWNLOAD_MAX_SECS)
            .carry_download(&self.gateway, &username, &asset.url, &download)
            .map_err(|error| format!("download {program}: {error:#}"))?;
        response.ensure_ok().map_err(|error| format!("download {program}: {error:#}"))?;
        let actual = sha256_of(&download).map_err(|error| error.to_string())?;
        if actual != asset.sha256 {
            let _ = std::fs::remove_file(&download);
            return Err(format!("{program} does not match its pinned sha256"));
        }
        match &asset.member {
            Some(member) => {
                take_member(&download, member, &destination)?;
                let _ = std::fs::remove_file(&download);
            }
            None => std::fs::rename(&download, &destination).map_err(|error| error.to_string())?,
        }
        make_executable(&destination).map_err(|error| error.to_string())?;
        std::fs::write(&pin, &asset.sha256).map_err(|error| error.to_string())?;
        Ok(destination)
    }

    pub(super) fn asset_for<'a>(&'a self, program: &str, helper: &'a Helper) -> Result<&'a HelperAsset, String> {
        helper
            .assets
            .get(&platform())
            .ok_or_else(|| format!("{program} has no build for {}", platform()))
    }

    // Starting never downloads, so a page that asks whether a helper is there does
    // not fetch it: only `ensure` does.
    pub(super) fn resolve(&self, program: &str) -> Result<PathBuf, String> {
        self.check_allowed(program)?;
        let Some(helper) = self.helpers.get(program) else {
            return on_path(program).ok_or_else(|| format!("{program} is not installed on this machine"));
        };
        let asset = self.asset_for(program, helper)?;
        let destination = self.helpers_dir.join(program);
        let pin = std::fs::read_to_string(self.helpers_dir.join(format!("{program}.sha256"))).unwrap_or_default();
        if destination.is_file() && pin.trim() == asset.sha256 {
            return Ok(destination);
        }
        Err(format!("{program} has not been fetched yet"))
    }
}
