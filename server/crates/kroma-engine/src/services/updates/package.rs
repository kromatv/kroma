//! The Synology package's own updater: the reviewed `.spk`, verified and
//! unpacked beside the package for its service script to start.

use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};
use tokio::sync::Notify;

use super::install::{idle_for, save_operation, Operation};
use crate::config::Install;
use crate::state::SharedState;

/// The exit status that asks the package's service script to start the server
/// again, on the newest payload it holds.
pub const RESTART_EXIT_CODE: i32 = 75;

const MAX_PACKAGE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const OFFICIAL_DOWNLOADS: &str = "https://github.com/kromatv/kroma/releases/download/";

static RESTARTING: AtomicBool = AtomicBool::new(false);

fn restart_signal() -> &'static Notify {
    static SIGNAL: OnceLock<Notify> = OnceLock::new();
    SIGNAL.get_or_init(Notify::new)
}

/// Whether an update asked this server to stop so its new payload starts.
pub fn restart_requested() -> bool {
    RESTARTING.load(Ordering::SeqCst)
}

/// Resolves once an update asks this server to stop so its new payload starts.
pub async fn wait_for_restart() {
    if !restart_requested() {
        restart_signal().notified().await;
    }
}

fn request_restart() {
    RESTARTING.store(true, Ordering::SeqCst);
    restart_signal().notify_one();
}

pub(super) fn ready(state: &SharedState) -> bool {
    state.config.install == Install::Synology
        && state
            .config
            .self_update_dir
            .as_deref()
            .is_some_and(Path::is_dir)
}

pub(super) fn start(state: &SharedState, op: &mut Operation) -> Result<()> {
    op.phase = "preparing".into();
    save_operation(state, op)?;
    let state = state.clone();
    let mut op = op.clone();
    std::thread::Builder::new()
        .name("server-update".into())
        .spawn(move || {
            if let Err(error) = apply(&state, &mut op) {
                tracing::warn!(%error, "the server update failed");
                op.phase = "failed".into();
                op.message = Some(format!("The update could not be installed: {error}"));
                let _ = save_operation(&state, &op);
            }
        })?;
    Ok(())
}

fn apply(state: &SharedState, op: &mut Operation) -> Result<()> {
    let dir = state
        .config
        .self_update_dir
        .as_deref()
        .context("The package has no folder for new builds.")?;
    let payload = dir.join(op.target.build.to_string());
    if !is_payload(&payload) {
        let package = super::package_of(state, &op.target)?;
        if state.config.releases_url.is_none() && !package.url.starts_with(OFFICIAL_DOWNLOADS) {
            bail!("The package is not hosted by the official KROMA releases.");
        }
        let spk = dir.join(format!("{}.spk.partial", op.target.build));
        download(&package.url, &spk)?;
        let unpacked = verify(&spk, &package.sha256).and_then(|()| {
            op.phase = "installing".into();
            save_operation(state, op)?;
            unpack(&spk, &dir.join(format!("{}.partial", op.target.build)))
        });
        let _ = std::fs::remove_file(&spk);
        std::fs::rename(unpacked?, &payload)?;
    }
    if !idle_for(state, op) {
        op.phase = "deferred".into();
        return save_operation(state, op);
    }
    op.phase = "restarting".into();
    save_operation(state, op)?;
    request_restart();
    Ok(())
}

fn is_payload(dir: &Path) -> bool {
    dir.join("bin/kroma-server").is_file() && dir.join("web/_shell.html").is_file()
}

fn download(url: &str, to: &Path) -> Result<()> {
    let out = std::process::Command::new("curl")
        .args(["-q", "--fail", "--silent", "--show-error", "--location"])
        .args(["--proto", "=http,https", "--proto-redir", "=http,https"])
        .args(["--max-time", "1800", "--max-filesize"])
        .arg(MAX_PACKAGE_BYTES.to_string())
        .arg("--output")
        .arg(to)
        .arg("--url")
        .arg(url)
        .output()
        .context("spawn curl")?;
    if !out.status.success() {
        bail!(
            "the download failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    Ok(())
}

fn verify(spk: &Path, sha256: &str) -> Result<()> {
    let mut hasher = Sha256::new();
    std::io::copy(&mut File::open(spk)?, &mut hasher)?;
    if hex::encode(hasher.finalize()) != sha256 {
        bail!("the package does not match its published checksum");
    }
    Ok(())
}

fn unpack(spk: &Path, into: &Path) -> Result<std::path::PathBuf> {
    if into.exists() {
        std::fs::remove_dir_all(into)?;
    }
    std::fs::create_dir_all(into)?;
    let mut package = tar::Archive::new(File::open(spk)?);
    for entry in package.entries()? {
        let entry = entry?;
        if entry.path()? != Path::new("package.tgz") {
            continue;
        }
        let payload = lzma_rust2::XzReader::new(BufReader::new(entry), false);
        tar::Archive::new(payload).unpack(into)?;
        if !is_payload(into) {
            bail!("the package payload has no server or no web app");
        }
        return Ok(into.to_path_buf());
    }
    bail!("the package carries no payload")
}

#[cfg(test)]
mod tests;
