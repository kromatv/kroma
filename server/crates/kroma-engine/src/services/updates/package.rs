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

#[derive(Default)]
struct Restart {
    requested: AtomicBool,
    signal: Notify,
}

impl Restart {
    fn request(&self) {
        self.requested.store(true, Ordering::SeqCst);
        self.signal.notify_one();
    }

    fn requested(&self) -> bool {
        self.requested.load(Ordering::SeqCst)
    }

    async fn wait(&self) {
        if !self.requested() {
            self.signal.notified().await;
        }
    }
}

fn restart() -> &'static Restart {
    static RESTART: OnceLock<Restart> = OnceLock::new();
    RESTART.get_or_init(Restart::default)
}

/// Whether an update asked this server to stop so its new payload starts.
pub fn restart_requested() -> bool {
    restart().requested()
}

/// Resolves once an update asks this server to stop so its new payload starts.
pub async fn wait_for_restart() {
    restart().wait().await;
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
        official(state.config.releases_url.as_deref(), &package.url)?;
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
    restart().request();
    Ok(())
}

fn official(feed: Option<&str>, url: &str) -> Result<()> {
    if feed.is_none() && !url.starts_with(OFFICIAL_DOWNLOADS) {
        bail!("The package is not hosted by the official KROMA releases.");
    }
    Ok(())
}

fn is_payload(dir: &Path) -> bool {
    dir.join("bin/kroma-server").is_file() && dir.join("web/_shell.html").is_file()
}

fn download(url: &str, to: &Path) -> Result<()> {
    kroma_http::Fetch::new()
        .purpose("updates")
        .max_time(1800)
        .max_bytes(MAX_PACKAGE_BYTES)
        .download(url, to)
        .and_then(kroma_http::Response::ensure_ok)
        .context("the download failed")?;
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
