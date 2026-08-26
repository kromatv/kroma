//! The opt-in anonymous heartbeat.
//!
//! One payload a day describing this install and nothing else: no name, no
//! address, no titles, no exact counts. It is sent only while `anonStats` is on,
//! which is off until an operator turns it on. What every field means, and what
//! is deliberately absent, is written down in `docs/anonymous-stats.md`.

mod buckets;
mod clients;
mod locales;
mod payload;

use anyhow::Result;
use serde_json::json;

use time::format_description::well_known::Rfc3339;
use time::{Duration, OffsetDateTime};

use crate::db::Pool;
use crate::services::settings::Settings;
use crate::state::SharedState;

pub use clients::Clients;
pub use payload::Payload;

pub const ENABLED_KEY: &str = "anonStats";
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
}

enum Outcome {
    Accepted,
    Transient(u16),
}

/// Send this install's heartbeat, or do nothing at all if the operator has not
/// asked for it.
pub fn run(state: &SharedState) -> Result<Report> {
    report(state, post)
}

fn report(
    state: &SharedState,
    mut send: impl FnMut(&str, &Payload) -> Result<Outcome>,
) -> Result<Report> {
    if !state.settings.get_bool(ENABLED_KEY, false) {
        return Ok(Report::Off);
    }
    let id = ensure_stats_id(&state.settings, &state.db);
    let last = state.settings.get_str(SENT_KEY, "");
    if !due(&id, &last, OffsetDateTime::now_utc()) {
        return Ok(Report::NotYet);
    }
    let payload = payload::build(state, id.clone())?;
    match send(&endpoint(), &payload)? {
        Outcome::Transient(status) => Ok(Report::Deferred(status)),
        Outcome::Accepted => {
            state.settings.set_internal(
                &state.db,
                SENT_KEY,
                json!(kroma_primitives::now_iso8601()),
            );
            Ok(Report::Sent(Box::new(payload)))
        }
    }
}

// The hour of the day this install reports in, spread across all 24 by its own
// identifier. A fixed hour for everyone would land the whole world on the
// collector in the same minute, and would make every install that opted in that
// day share a first-seen minute, which is the shape the collector's fleet
// detection looks for.
fn slot_hour(id: &str) -> u8 {
    id.bytes().fold(0u16, |acc, b| (acc + b as u16) % 24) as u8
}

// Once a day, in this install's own hour. A server that has never reported goes
// at the next run whatever the hour, so switching the toggle on and watching it
// work does not mean waiting until tomorrow.
fn due(id: &str, last_sent: &str, now: OffsetDateTime) -> bool {
    let Ok(last) = OffsetDateTime::parse(last_sent.trim(), &Rfc3339) else {
        return true;
    };
    now - last >= Duration::hours(23) && now.hour() == slot_hour(id)
}

// Separate from `instanceId`, which is served on the public health endpoint and
// announced over DNS-SD: reusing it would let anyone who can reach this server
// look up the row it writes.
/// Mint this install's statistics identifier if it has none, and return it.
/// Called when consent is given, and again by the job in case it was not.
pub fn ensure_identity(settings: &Settings, pool: &Pool) -> String {
    ensure_stats_id(settings, pool)
}

fn ensure_stats_id(settings: &Settings, pool: &Pool) -> String {
    let existing = settings.get_str(ID_KEY, "");
    if !existing.trim().is_empty() {
        return existing;
    }
    let id = kroma_primitives::random_token();
    settings.set_internal(pool, ID_KEY, json!(id.clone()));
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
    anyhow::bail!(
        "the statistics endpoint rejected the payload: {}",
        res.status
    )
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
mod tests {
    use super::*;
    use crate::test_support::test_state;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn enable(state: &SharedState) {
        state
            .settings
            .set_patch(&state.db, [(ENABLED_KEY.to_string(), json!(true))].into());
    }

    #[test]
    fn an_install_nobody_opted_in_sends_nothing_and_mints_no_id() {
        let state = test_state();
        let calls = AtomicUsize::new(0);

        let report = report(&state, |_, _| {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(Outcome::Accepted)
        })
        .unwrap();

        assert_eq!(report, Report::Off);
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        assert_eq!(state.settings.get_str(ID_KEY, ""), "");
        assert_eq!(state.settings.get_str(SENT_KEY, ""), "");
    }

    #[test]
    fn opting_in_mints_one_id_and_keeps_it_across_runs() {
        let state = test_state();
        enable(&state);

        report(&state, |_, _| Ok(Outcome::Accepted)).unwrap();
        let first = state.settings.get_str(ID_KEY, "");
        state.settings.set_internal(&state.db, SENT_KEY, json!(""));
        report(&state, |_, _| Ok(Outcome::Accepted)).unwrap();

        assert_eq!(first.len(), 64);
        assert_ne!(first, state.instance_id);
        assert_eq!(state.settings.get_str(ID_KEY, ""), first);
    }

    #[test]
    fn no_caller_can_choose_the_stats_id_through_the_settings_patch() {
        let state = test_state();
        enable(&state);
        report(&state, |_, _| Ok(Outcome::Accepted)).unwrap();
        let minted = state.settings.get_str(ID_KEY, "");

        let written = state
            .settings
            .set_patch(&state.db, [(ID_KEY.to_string(), json!("chosen"))].into());

        assert!(
            written.is_empty(),
            "the allow-list let it through: {written:?}"
        );
        assert_eq!(state.settings.get_str(ID_KEY, ""), minted);
    }

    #[test]
    fn a_run_that_was_accepted_stamps_when_it_happened() {
        let state = test_state();
        enable(&state);

        let report = report(&state, |_, _| Ok(Outcome::Accepted)).unwrap();

        assert!(matches!(report, Report::Sent(_)));
        assert!(!state.settings.get_str(SENT_KEY, "").is_empty());
    }

    #[test]
    fn a_server_that_has_never_reported_goes_at_the_next_run_whatever_the_hour() {
        let now = OffsetDateTime::now_utc();

        assert!(due("any-id", "", now));
        assert!(due("any-id", "not a timestamp", now));
    }

    #[test]
    fn a_server_that_reported_today_waits_for_its_own_hour_tomorrow() {
        let id = "a".repeat(64);
        let hour = slot_hour(&id);
        let yesterday = OffsetDateTime::now_utc() - Duration::hours(30);
        let stamp = yesterday.format(&Rfc3339).unwrap();
        let at = |h: u8| {
            yesterday.replace_time(time::Time::from_hms(h, 30, 0).unwrap()) + Duration::days(1)
        };

        assert!(due(&id, &stamp, at(hour)), "its own hour");
        assert!(
            !due(&id, &stamp, at((hour + 1) % 24)),
            "somebody else's hour"
        );
    }

    #[test]
    fn a_server_that_reported_an_hour_ago_does_not_report_again() {
        let id = "b".repeat(64);
        let now = OffsetDateTime::now_utc();
        let recent = (now - Duration::hours(1)).format(&Rfc3339).unwrap();

        assert!(!due(&id, &recent, now));
    }

    #[test]
    fn the_reporting_hour_is_spread_across_the_day_rather_than_shared() {
        let hours: std::collections::HashSet<u8> = (0..200u32)
            .map(|i| slot_hour(&format!("{i:064x}")))
            .collect();

        assert!(hours.len() > 12, "only {} distinct hours", hours.len());
        assert!(hours.iter().all(|h| *h < 24));
    }

    #[test]
    fn a_wobble_at_the_far_end_defers_rather_than_pretending_it_landed() {
        let state = test_state();
        enable(&state);

        let report = report(&state, |_, _| Ok(Outcome::Transient(503))).unwrap();

        assert_eq!(report, Report::Deferred(503));
        assert_eq!(state.settings.get_str(SENT_KEY, ""), "");
    }

    // The one seam the tests above stub out: `post` actually speaking HTTP.
    // Ignored because it needs a collector; run it against a local one with
    //   cd packages/stats-relay/worker && bunx wrangler dev
    //   cargo test -p kroma-engine stats -- --ignored --nocapture
    #[test]
    #[ignore = "needs a collector at KROMA_STATS_URL"]
    fn a_real_collector_accepts_what_this_server_actually_sends() {
        let state = test_state();
        enable(&state);

        let report = run(&state).unwrap();

        assert!(matches!(report, Report::Sent(_)), "{report:?}");
        assert!(!state.settings.get_str(SENT_KEY, "").is_empty());
    }

    #[test]
    fn the_payload_goes_to_the_ping_route_of_the_one_address_every_server_uses() {
        let state = test_state();
        enable(&state);

        let mut seen = String::new();
        report(&state, |url, _| {
            seen = url.to_string();
            Ok(Outcome::Accepted)
        })
        .unwrap();

        assert!(seen.ends_with("/v1/ping"), "{seen}");
        assert!(!seen.contains("//v1"), "{seen}");
    }
}
