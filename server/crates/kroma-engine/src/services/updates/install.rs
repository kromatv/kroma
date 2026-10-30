//! A file bridge keeps host privileges outside the media server. Only the
//! operator can configure it; API callers supply a release identity, never a
//! command, URL, filesystem path, or container name.
use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

use super::{Channel, Status};
use crate::services::settings::build_info;
use crate::state::SharedState;

static INSTALL_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub channel: Channel,
    pub version: String,
    pub build: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    pub id: String,
    pub target: Target,
    pub phase: String,
    pub message: Option<String>,
    pub requested_at: String,
    #[serde(default)]
    pub automatic: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installer {
    pub platform: String,
    pub ready: bool,
}

#[derive(Deserialize)]
struct Heartbeat {
    protocol: u8,
    platform: String,
    timestamp: u64,
}

fn read<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    let file = std::fs::File::open(path).ok()?;
    use std::io::Read;
    serde_json::from_reader(file.take(64 * 1024)).ok()
}

pub(super) fn installer(state: &SharedState) -> Installer {
    let platform = state.config.install.as_str().to_owned();
    let heartbeat = state
        .config
        .update_dir
        .as_ref()
        .and_then(|dir| read::<Heartbeat>(&dir.join("heartbeat.json")));
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let ready = heartbeat.is_some_and(|h| {
        h.protocol == 1
            && h.platform == platform
            && h.timestamp <= now + 5
            && now.saturating_sub(h.timestamp) < 90
    });
    Installer { platform, ready }
}

pub(super) fn operation(state: &SharedState) -> Option<Operation> {
    let dir = state.config.update_dir.as_ref()?;
    let request: Operation = serde_json::from_value(state.settings.get(super::OPERATION_KEY))
        .ok()
        .or_else(|| read(&dir.join("request.json")))?;
    let mut op = read::<Operation>(&dir.join("result.json"))
        .filter(|result| result.id == request.id)
        .unwrap_or(request);
    let build = build_info();
    if build.version == op.target.version && build.number == op.target.build {
        op.phase = "complete".into();
        op.message = None;
    }
    Some(op)
}

/// Startup recovery for work that was never handed to the host. Once a request
/// exists, only the independently supervised updater reconciles the operation.
pub fn recover(state: &SharedState) -> Result<()> {
    let Some(dir) = state.config.update_dir.as_ref() else {
        return Ok(());
    };
    let Ok(mut op) = serde_json::from_value::<Operation>(state.settings.get(super::OPERATION_KEY))
    else {
        return Ok(());
    };
    let published = read::<Operation>(&dir.join("request.json")).is_some_and(|r| r.id == op.id);
    if op.phase == "backing_up" || op.phase == "queued" && !published {
        op.phase = "failed".into();
        op.message = Some(
            "The server restarted before the update was handed to the host. Try again.".into(),
        );
        save_operation(state, &op)?;
    }
    Ok(())
}

/// Recheck the feed before accepting the exact release the owner reviewed.
/// A single durable request survives server replacement and repeated clicks.
pub fn install(state: &SharedState, target: Target) -> Result<Status> {
    install_with_policy(state, target, false)
}

/// Opt-in automation: only a published, healthy-feed release, an online host
/// updater, and no live playback (including paused players). Failed releases
/// require manual retry instead of repeatedly backing up/restarting unattended.
pub fn install_automatically(state: &SharedState) -> Result<Option<Status>> {
    let shown = super::status(state);
    if !shown.auto
        || !shown.auto_install
        || !shown.available
        || shown.error.is_some()
        || !shown.installer.ready
        || !state.playback.list().is_empty()
    {
        return Ok(None);
    }
    let Some(latest) = shown.latest else {
        return Ok(None);
    };
    let Some(build) = latest.build.filter(|b| *b > 0) else {
        return Ok(None);
    };
    let target = Target {
        channel: shown.channel,
        version: latest.version,
        build,
    };
    if shown.operation.is_some_and(|op| {
        op.phase == "failed" && op.target == target
            || !matches!(op.phase.as_str(), "complete" | "failed" | "deferred")
    }) {
        return Ok(None);
    }
    install_with_policy(state, target, true).map(Some)
}

fn save_operation(state: &SharedState, op: &Operation) -> Result<()> {
    state
        .settings
        .set_internal(&state.db, super::OPERATION_KEY, serde_json::to_value(op)?)
}

fn install_with_policy(state: &SharedState, target: Target, automatic: bool) -> Result<Status> {
    let _guard = INSTALL_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if !installer(state).ready {
        bail!("The host updater is offline or has not been configured.");
    }
    if let Some(op) = operation(state) {
        if !matches!(op.phase.as_str(), "complete" | "failed" | "deferred") {
            bail!("An update is already in progress.");
        }
    }
    if automatic
        && (!state.settings.get_bool(super::AUTO_INSTALL_KEY, false)
            || !state.playback.list().is_empty())
    {
        return Ok(super::status(state));
    }
    let status = super::check(state)?;
    if status.error.is_some() {
        bail!("The release could not be verified. Check for updates and try again.");
    }
    let matches = status.latest.as_ref().is_some_and(|latest| {
        latest.version == target.version && latest.build == Some(target.build)
    });
    if !status.available || status.channel != target.channel || !matches || target.build == 0 {
        bail!("The available release changed. Refresh before updating.");
    }
    let dir = state
        .config
        .update_dir
        .as_ref()
        .context("No update directory")?;
    let mut op = Operation {
        id: kroma_primitives::random_token(),
        target,
        phase: "backing_up".into(),
        message: None,
        requested_at: kroma_primitives::now_iso8601(),
        automatic,
    };
    save_operation(state, &op)?;
    let prepared = prepare(state, dir, &mut op, automatic);
    if let Err(error) = prepared {
        op.phase = "failed".into();
        op.message = Some(format!("The update could not be prepared: {error}"));
        save_operation(state, &op)?;
        return Err(error);
    }
    Ok(super::status(state))
}

fn prepare(state: &SharedState, dir: &Path, op: &mut Operation, automatic: bool) -> Result<()> {
    // A portable backup is made before the host sees a request. Failure here
    // leaves the running installation untouched. Backups contain credentials.
    let backups = state.config.data_dir.join("update-backups");
    std::fs::create_dir_all(&backups)?;
    let bytes = crate::services::backup::export(&state.db, &state.config.data_dir, None)?;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    use std::io::Write;
    let mut backup = options.open(backups.join(format!("{}.zip", op.id)))?;
    backup.write_all(&bytes)?;
    backup.sync_all()?;
    // A stream might have started while the backup was being written. Recheck
    // just before handing off to the host, including an opt-out made meanwhile.
    if automatic
        && (!state.settings.get_bool(super::AUTO_INSTALL_KEY, false)
            || !state.playback.list().is_empty())
    {
        op.phase = "deferred".into();
        save_operation(state, op)?;
        return Ok(());
    }
    op.phase = "queued".into();
    save_operation(state, op)?;
    let tmp = dir.join("request.tmp");
    std::fs::write(&tmp, serde_json::to_vec(&op)?)?;
    std::fs::rename(tmp, dir.join("request.json"))?;
    Ok(())
}
