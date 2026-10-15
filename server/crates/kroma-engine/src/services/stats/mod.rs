//! The anonymous heartbeat.
//!
//! One payload a day describing this install and nothing else: no name, no
//! address, no titles, nothing about what is watched. It is sent while
//! `anonStats` is on, which it is until an operator switches it off. What every
//! field means, and what is deliberately absent, is written down in
//! `docs/anonymous-stats.md`.

mod clients;
mod locales;
mod payload;
mod preferences;
mod schedule;

use anyhow::Result;
use serde_json::json;
use time::OffsetDateTime;

use crate::db::Pool;
use crate::services::settings::Settings;
use crate::state::SharedState;

pub use clients::Clients;
pub use payload::Payload;
pub use preferences::Preferences;

use schedule::due;

pub const ENABLED_KEY: &str = "anonStats";
pub const USAGE_KEY: &str = "anonStatsUsage";
pub const STATISTICS_KEY: &str = "anonStatsStatistics";
pub const ID_KEY: &str = "statsId";
pub const SENT_KEY: &str = "stats.lastSentAt";

// A constant rather than a setting, for the same reason the push relay's
// address is one: it is the same address for every KROMA server, and letting an
// operator point it at an arbitrary host would be a phishing route, not a
// feature. A debug build honours `KROMA_STATS_URL` so the loop can be run
// against a worker on this machine.
const STATS_URL: &str = "https://stats.kroma.tv";

/// What one run did. The job turns this into its log line, which is the only
/// place an operator has to look to see what left the box.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Report {
    Off,
    NotYet,
    Sent(Box<Payload>),
    Deferred(u16),
    Refused(u16),
}

enum Outcome {
    Accepted,
    Transient(u16),
    Refused(u16),
}

/// Send this install's heartbeat, or do nothing at all if the operator has
/// switched it off.
pub fn run(state: &SharedState) -> Result<Report> {
    report(state, post)
}

fn report(
    state: &SharedState,
    mut send: impl FnMut(&str, &Payload) -> Result<Outcome>,
) -> Result<Report> {
    let prefs = Preferences::read(&state.settings);
    if !prefs.base {
        return Ok(Report::Off);
    }
    let id = ensure_stats_id(&state.settings, &state.db);
    let last = state.settings.get_str(SENT_KEY, "");
    if !due(&id, &last, OffsetDateTime::now_utc()) {
        return Ok(Report::NotYet);
    }
    let payload = payload::build(state, id.clone(), prefs)?;
    let outcome = send(&endpoint(), &payload)?;
    if let Outcome::Transient(status) = outcome {
        return Ok(Report::Deferred(status));
    }
    // A refusal is stamped like a delivery: the collector answered, so the next
    // attempt belongs tomorrow rather than in an hour.
    let stamped = state
        .settings
        .set_internal(&state.db, SENT_KEY, json!(kroma_primitives::now_iso8601()));
    if let Err(error) = stamped {
        tracing::warn!(%error, "could not store the send date; the next start sends again today");
    }
    Ok(match outcome {
        Outcome::Refused(status) => Report::Refused(status),
        _ => Report::Sent(Box::new(payload)),
    })
}

// Separate from `instanceId`, which is served on the public health endpoint and
// announced over DNS-SD: reusing it would let anyone who can reach this server
// look up the row it writes.
/// Mint this install's statistics identifier if it has none, and return it.
/// Called at boot and again whenever the switch is written, so the settings page
/// always has an identifier to show.
pub fn ensure_identity(settings: &Settings, pool: &Pool) -> String {
    ensure_stats_id(settings, pool)
}

fn ensure_stats_id(settings: &Settings, pool: &Pool) -> String {
    let existing = settings.get_str(ID_KEY, "");
    if !existing.trim().is_empty() {
        return existing;
    }
    let id = kroma_primitives::random_token();
    if let Err(error) = settings.set_internal(pool, ID_KEY, json!(id.clone())) {
        tracing::warn!(%error, "could not store the statistics id; the next start mints another");
    }
    id
}

fn post(url: &str, payload: &Payload) -> Result<Outcome> {
    let body = serde_json::to_value(payload)?;
    // A server with no route out is not a broken server, and a job that fails
    // every night notifies its admins every night about the one thing they
    // asked to be optional.
    let Ok(res) = kroma_http::Fetch::new().max_time(15).post_json(url, &body) else {
        return Ok(Outcome::Transient(0));
    };
    if res.status < 400 {
        return Ok(Outcome::Accepted);
    }
    // The next run is the retry; a wobble at the far end is not something to
    // wake an operator for.
    if matches!(res.status, 408 | 429 | 500..=599) {
        return Ok(Outcome::Transient(res.status));
    }
    // Neither is a refusal. Whatever the collector will not accept, an operator
    // cannot fix from their side, and a failed job here is a notification about
    // a feature they were promised would stay out of their way.
    Ok(Outcome::Refused(res.status))
}

fn endpoint() -> String {
    let base = base_url();
    format!("{}/v1/ping", base.trim_end_matches('/'))
}

#[cfg(debug_assertions)]
fn base_url() -> String {
    match std::env::var("KROMA_STATS_URL") {
        Ok(url) if !url.trim().is_empty() => url.trim().to_string(),
        _ => STATS_URL.to_string(),
    }
}

#[cfg(not(debug_assertions))]
fn base_url() -> String {
    STATS_URL.to_string()
}

#[cfg(test)]
mod tests;
