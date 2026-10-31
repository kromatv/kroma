//! A file bridge keeps host privileges outside the media server. Only the
//! operator can configure it; API callers supply a release identity, never a
//! command, URL, filesystem path, or container name.
use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{bail, Result};
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
    let ready = match state.config.update_dir.as_ref() {
        Some(dir) => host_ready(dir, &platform),
        None => super::package::ready(state),
    };
    Installer { platform, ready }
}

fn host_ready(dir: &Path, platform: &str) -> bool {
    let heartbeat = read::<Heartbeat>(&dir.join("heartbeat.json"));
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    heartbeat.is_some_and(|h| {
        h.protocol == 1
            && h.platform == platform
            && h.timestamp <= now + 5
            && now.saturating_sub(h.timestamp) < 90
    })
}

fn running(target: &Target) -> bool {
    let build = build_info();
    build.version == target.version && build.number == target.build
}

fn settled(op: &Operation) -> bool {
    matches!(op.phase.as_str(), "complete" | "failed" | "deferred")
}

fn stored(state: &SharedState) -> Option<Operation> {
    serde_json::from_value(state.settings.get(super::OPERATION_KEY)).ok()
}

pub(super) fn operation(state: &SharedState) -> Option<Operation> {
    let mut op = match state.config.update_dir.as_ref() {
        Some(dir) => {
            let request = stored(state).or_else(|| read(&dir.join("request.json")))?;
            read::<Operation>(&dir.join("result.json"))
                .filter(|result| result.id == request.id)
                .unwrap_or(request)
        }
        None => stored(state)?,
    };
    if running(&op.target) {
        op.phase = "complete".into();
        op.message = None;
    }
    Some(op)
}

/// Startup recovery for work this server owned when it stopped. Once a request
/// reaches a host bridge, only the independently supervised updater reconciles it.
pub fn recover(state: &SharedState) -> Result<()> {
    let Some(mut op) = stored(state) else {
        return Ok(());
    };
    if settled(&op) || running(&op.target) {
        return Ok(());
    }
    let message = match state.config.update_dir.as_ref() {
        Some(dir) => {
            let published =
                read::<Operation>(&dir.join("request.json")).is_some_and(|r| r.id == op.id);
            if op.phase != "backing_up" && (op.phase != "queued" || published) {
                return Ok(());
            }
            "The server restarted before the update was handed to the host. Try again."
        }
        None if op.phase == "restarting" => {
            "The server restarted on its previous build. Try again, or install the package from Package Center."
        }
        None => "The server restarted before the update was ready. Try again.",
    };
    op.phase = "failed".into();
    op.message = Some(message.into());
    save_operation(state, &op)
}

/// Recheck the feed before accepting the exact release the owner reviewed.
/// A single durable request survives server replacement and repeated clicks.
pub fn install(state: &SharedState, target: Target) -> Result<Status> {
    install_with_policy(state, target, false)
}

/// Automation: only a published, healthy-feed release, a ready installer, and
/// no live playback (including paused players). Failed releases require a
/// manual retry instead of repeatedly backing up/restarting unattended.
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
    if shown
        .operation
        .is_some_and(|op| op.phase == "failed" && op.target == target || !settled(&op))
    {
        return Ok(None);
    }
    install_with_policy(state, target, true).map(Some)
}

pub(super) fn save_operation(state: &SharedState, op: &Operation) -> Result<()> {
    state
        .settings
        .set_internal(&state.db, super::OPERATION_KEY, serde_json::to_value(op)?)
}

pub(super) fn idle_for(state: &SharedState, op: &Operation) -> bool {
    !op.automatic || super::auto_install(state) && state.playback.list().is_empty()
}

fn install_with_policy(state: &SharedState, target: Target, automatic: bool) -> Result<Status> {
    let _guard = INSTALL_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if !installer(state).ready {
        bail!("The host updater is offline or has not been configured.");
    }
    if operation(state).is_some_and(|op| !settled(&op)) {
        bail!("An update is already in progress.");
    }
    if automatic && (!super::auto_install(state) || !state.playback.list().is_empty()) {
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
    let mut op = Operation {
        id: kroma_primitives::random_token(),
        target,
        phase: "backing_up".into(),
        message: None,
        requested_at: kroma_primitives::now_iso8601(),
        automatic,
    };
    save_operation(state, &op)?;
    if let Err(error) = prepare(state, &mut op) {
        op.phase = "failed".into();
        op.message = Some(format!("The update could not be prepared: {error}"));
        save_operation(state, &op)?;
        return Err(error);
    }
    Ok(super::status(state))
}

pub(super) fn prepare(state: &SharedState, op: &mut Operation) -> Result<()> {
    backup(state, &op.id)?;
    // A stream might have started while the backup was being written. Recheck
    // just before handing off to the host, including an opt-out made meanwhile.
    if !idle_for(state, op) {
        op.phase = "deferred".into();
        return save_operation(state, op);
    }
    match state.config.update_dir.as_deref() {
        Some(dir) => publish(state, dir, op),
        None => super::package::start(state, op),
    }
}

fn backup(state: &SharedState, id: &str) -> Result<()> {
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
    let mut backup = options.open(backups.join(format!("{id}.zip")))?;
    backup.write_all(&bytes)?;
    backup.sync_all()?;
    Ok(())
}

fn publish(state: &SharedState, dir: &Path, op: &mut Operation) -> Result<()> {
    op.phase = "queued".into();
    save_operation(state, op)?;
    let tmp = dir.join("request.tmp");
    std::fs::write(&tmp, serde_json::to_vec(&op)?)?;
    std::fs::rename(tmp, dir.join("request.json"))?;
    Ok(())
}
