//! Channel-aware discovery and owner-initiated updates through a host bridge.

mod feed;
mod install;
pub use install::{install, install_automatically, recover, Installer, Operation, Target};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::services::settings::{build_info, Settings};
use crate::state::SharedState;

pub use feed::{is_newer, Latest};

pub const CHANNEL_KEY: &str = "updateChannel";
pub const AUTO_KEY: &str = "autoUpdate";
pub const AUTO_INSTALL_KEY: &str = "autoInstallUpdates";
pub const OPERATION_KEY: &str = "update.operation";
pub const STATUS_KEY: &str = "update.status";

const RELEASES_URL: &str = "https://api.github.com/repos/kromatv/kroma/releases";
const MAX_FEED_BYTES: u64 = 4 * 1024 * 1024;

/// Which feed the owner follows: tagged releases, or every build of main.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Channel {
    Stable,
    Canary,
}

/// The channel the owner chose in Admin -> General.
pub fn channel(settings: &Settings) -> Channel {
    if settings
        .get_str(CHANNEL_KEY, "Stable")
        .eq_ignore_ascii_case("canary")
    {
        Channel::Canary
    } else {
        Channel::Stable
    }
}

/// What the last check found, as stored between checks.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checked {
    pub channel: Channel,
    pub latest: Option<Latest>,
    pub checked_at: String,
    pub error: Option<String>,
}

/// The admin's view: what runs, what the channel offers, and whether it is newer.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub version: String,
    pub build: u64,
    pub channel: Channel,
    pub auto: bool,
    pub auto_install: bool,
    pub latest: Option<Latest>,
    pub available: bool,
    pub checked_at: Option<String>,
    pub error: Option<String>,
    pub installer: Installer,
    pub operation: Option<Operation>,
}

fn stored(settings: &Settings, channel: Channel) -> Option<Checked> {
    serde_json::from_value::<Checked>(settings.get(STATUS_KEY))
        .ok()
        .filter(|checked| checked.channel == channel)
}

/// The stored result against the running build. A result for another channel
/// than the one now chosen is not shown: it answered a different question.
pub fn status(state: &SharedState) -> Status {
    let build = build_info();
    let channel = channel(&state.settings);
    let checked = stored(&state.settings, channel);
    let latest = checked.as_ref().and_then(|c| c.latest.clone());
    Status {
        available: latest
            .as_ref()
            .is_some_and(|l| is_newer(l, &build.version, build.number)),
        version: build.version,
        build: build.number,
        channel,
        auto: state.settings.get_bool(AUTO_KEY, true),
        auto_install: state.settings.get_bool(AUTO_INSTALL_KEY, false),
        latest,
        checked_at: checked.as_ref().map(|c| c.checked_at.clone()),
        error: checked.and_then(|c| c.error),
        installer: install::installer(state),
        operation: install::operation(state),
    }
}

/// Ask the feed now and store the answer. A failure keeps the last answer the
/// channel gave and records the error beside it, and an answer for a channel
/// the owner left while the request was out is dropped.
pub fn check(state: &SharedState) -> Result<Status> {
    let asked = channel(&state.settings);
    let base = state.config.releases_url.as_deref().unwrap_or(RELEASES_URL);
    let fetched = fetch(base, asked);
    if channel(&state.settings) != asked {
        return Ok(status(state));
    }
    let (latest, error) = match fetched {
        Ok(latest) => (latest, None),
        Err(error) => {
            let kept = stored(&state.settings, asked).and_then(|c| c.latest);
            (kept, Some(error.to_string()))
        }
    };
    let checked = Checked {
        channel: asked,
        latest,
        checked_at: kroma_primitives::now_iso8601(),
        error,
    };
    state
        .settings
        .set_internal(&state.db, STATUS_KEY, json!(checked))?;
    Ok(status(state))
}

fn fetch(base: &str, channel: Channel) -> Result<Option<Latest>> {
    let path = match channel {
        Channel::Stable => "latest",
        Channel::Canary => "tags/canary",
    };
    let url = format!("{}/{path}", base.trim_end_matches('/'));
    let res = kroma_http::Fetch::new()
        .purpose("updates")
        .max_time(15)
        .max_bytes(MAX_FEED_BYTES)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", format!("KROMA/{}", build_info().version))
        .get(&url)?;
    if res.status == 404 {
        return Ok(None);
    }
    let release = res.ensure_ok()?.json::<feed::Release>()?;
    Ok(match channel {
        Channel::Stable => feed::stable(release),
        Channel::Canary => feed::canary(release),
    })
}

#[cfg(test)]
mod tests;
