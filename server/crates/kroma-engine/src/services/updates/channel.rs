use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::{feed, get, Channel, CHANNEL_KEY, DETECTED_KEY};
use crate::services::settings::{build_info, Settings};
use crate::state::SharedState;

/// The channel the owner chose or, until they choose one, the channel the
/// running build was published on.
pub fn channel(settings: &Settings) -> Channel {
    channel_for(settings, build_info().number)
}

fn channel_for(settings: &Settings, build: u64) -> Channel {
    chosen(settings)
        .or_else(|| detected(settings, build))
        .unwrap_or(Channel::Stable)
}

fn chosen(settings: &Settings) -> Option<Channel> {
    let Value::String(name) = settings.get(CHANNEL_KEY) else {
        return None;
    };
    Some(if name.eq_ignore_ascii_case("canary") {
        Channel::Canary
    } else {
        Channel::Stable
    })
}

#[derive(Serialize, Deserialize)]
struct Detected {
    build: u64,
    channel: Channel,
}

fn detected(settings: &Settings, build: u64) -> Option<Channel> {
    serde_json::from_value::<Detected>(settings.get(DETECTED_KEY))
        .ok()
        .filter(|detected| detected.build == build)
        .map(|detected| detected.channel)
}

pub(super) fn detect(state: &SharedState, base: &str, version: &str, build: u64) {
    let settings = &state.settings;
    if build == 0 || chosen(settings).is_some() || detected(settings, build).is_some() {
        return;
    }
    let saved = published_on(base, version, build).and_then(|channel| {
        settings.set_internal(&state.db, DETECTED_KEY, json!(Detected { build, channel }))
    });
    if let Err(error) = saved {
        tracing::warn!(%error, "could not tell which channel this build was published on");
    }
}

fn published_on(base: &str, version: &str, build: u64) -> Result<Channel> {
    let res = get(base, &format!("tags/v{version}"))?;
    if res.status == 404 {
        return Ok(Channel::Canary);
    }
    let release = res.ensure_ok()?.json::<feed::Release>()?;
    Ok(if feed::ships(release, version, build) {
        Channel::Stable
    } else {
        Channel::Canary
    })
}

#[cfg(test)]
mod tests;
