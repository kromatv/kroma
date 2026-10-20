//! Whether a newer server exists on the owner's channel. A passive notice and
//! never an action (ADMIN-89): the check reads GitHub's release feed and
//! stores what it found; nothing here downloads or installs anything.

mod feed;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::services::settings::build_info;
use crate::state::SharedState;

pub use feed::{is_newer, Latest};

pub const CHANNEL_KEY: &str = "updateChannel";
pub const AUTO_KEY: &str = "autoUpdate";
pub const STATUS_KEY: &str = "update.status";

const RELEASES_URL: &str = "https://api.github.com/repos/kromatv/kroma/releases";

/// Which feed the owner follows: tagged releases, or every build of main.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Channel {
    Stable,
    Canary,
}

impl Channel {
    fn of(setting: &str) -> Self {
        if setting.eq_ignore_ascii_case("canary") {
            Self::Canary
        } else {
            Self::Stable
        }
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
    pub latest: Option<Latest>,
    pub available: bool,
    pub checked_at: Option<String>,
    pub error: Option<String>,
}

/// The stored result against the running build. A result for another channel
/// than the one now chosen is not shown: it answered a different question.
pub fn status(state: &SharedState) -> Status {
    let build = build_info();
    let channel = Channel::of(&state.settings.get_str(CHANNEL_KEY, "Stable"));
    let checked = serde_json::from_value::<Checked>(state.settings.get(STATUS_KEY))
        .ok()
        .filter(|c| c.channel == channel);
    let latest = checked.as_ref().and_then(|c| c.latest.clone());
    let available = latest
        .as_ref()
        .is_some_and(|l| is_newer(channel, l, &build.version, build.number));
    Status {
        version: build.version,
        build: build.number,
        channel,
        auto: state.settings.get_bool(AUTO_KEY, true),
        latest,
        available,
        checked_at: checked.as_ref().map(|c| c.checked_at.clone()),
        error: checked.and_then(|c| c.error),
    }
}

/// Ask the feed now and store the answer, a failure included: an offline server
/// shows when it last tried rather than an empty notice.
pub fn check(state: &SharedState) -> Result<Status> {
    let channel = Channel::of(&state.settings.get_str(CHANNEL_KEY, "Stable"));
    let (latest, error) = match fetch(channel) {
        Ok(latest) => (latest, None),
        Err(error) => (None, Some(error.to_string())),
    };
    let checked = Checked {
        channel,
        latest,
        checked_at: kroma_primitives::now_iso8601(),
        error,
    };
    state
        .settings
        .set_internal(&state.db, STATUS_KEY, json!(checked))?;
    Ok(status(state))
}

fn fetch(channel: Channel) -> Result<Option<Latest>> {
    let path = match channel {
        Channel::Stable => "latest",
        Channel::Canary => "tags/canary",
    };
    let url = format!("{}/{path}", base_url().trim_end_matches('/'));
    let res = kroma_http::Fetch::new()
        .max_time(15)
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

#[cfg(debug_assertions)]
fn base_url() -> String {
    match std::env::var("KROMA_UPDATES_URL") {
        Ok(url) if !url.trim().is_empty() => url.trim().to_string(),
        _ => RELEASES_URL.to_string(),
    }
}

#[cfg(not(debug_assertions))]
fn base_url() -> String {
    RELEASES_URL.to_string()
}

#[cfg(test)]
mod tests;
