use anyhow::Result;
use serde::Serialize;
use time::format_description::well_known::Rfc3339;
use time::{Duration, OffsetDateTime};

use crate::state::SharedState;

use super::clients::{self, Clients};
use super::locales;
use super::preferences::Preferences;

// A device is "active" if it was seen inside this window.
const ACTIVE_DAYS: i64 = 7;

/// The payload's shape. Bumped whenever a field is added, removed or given a
/// new meaning, in the same commit as `docs/anonymous-stats.md`.
pub const SCHEMA: u32 = 3;

/// What one install says about itself. The base block is always there; a detail
/// block is `None` when its switch is off, and `serde` leaves the key out
/// entirely rather than sending an empty one, so the collector can tell a server
/// with no modules from a server not saying.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Payload {
    pub schema: u32,
    pub id: String,
    pub version: String,
    pub commit: String,
    pub target: String,
    pub install: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locales: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modules: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clients: Option<Clients>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub users: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub titles: Option<i64>,
}

pub fn build(state: &SharedState, id: String, prefs: Preferences) -> Result<Payload> {
    let build = crate::services::settings::build_info();
    let devices = if prefs.usage || prefs.statistics {
        crate::db::devices_seen_since(&state.db, &active_since())?
    } else {
        Vec::new()
    };
    Ok(Payload {
        schema: SCHEMA,
        id,
        version: build.version,
        commit: build.commit,
        target: build.target,
        install: state.config.install.as_str(),
        locales: prefs.usage.then(|| locales::spoken(&devices)),
        modules: prefs.usage.then(|| enabled_official(state)),
        clients: prefs.statistics.then(|| clients::tally(&devices)),
        users: prefs
            .statistics
            .then(|| crate::db::user_count(&state.db))
            .transpose()?,
        titles: prefs.statistics.then(|| library_size(state)).transpose()?,
    })
}

// Films and shows, not every episode row: a library of 40 series is 40 titles,
// not the several hundred files they arrive in.
fn library_size(state: &SharedState) -> Result<i64> {
    let (_, _, shows) = crate::db::counts(&state.db)?;
    Ok(crate::db::movie_count(&state.db)? + shows as i64)
}

fn enabled_official(state: &SharedState) -> Vec<String> {
    let mut ids: Vec<String> = (state.official_modules)()
        .into_iter()
        .filter(|id| crate::modules::module_enabled(&state.settings, id))
        .collect();
    ids.sort();
    ids.dedup();
    ids
}

fn active_since() -> String {
    (OffsetDateTime::now_utc() - Duration::days(ACTIVE_DAYS))
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::test_state;

    const EVERYTHING: Preferences = Preferences {
        base: true,
        usage: true,
        statistics: true,
    };

    fn with_devices(state: &crate::state::SharedState, languages: &[&str]) {
        let user = crate::db::create_user(
            &state.db,
            "a@b.c",
            "alice",
            "hash",
            &[kroma_domain::Permission::Playback],
        )
        .unwrap();
        for (n, language) in languages.iter().enumerate() {
            crate::db::create_access_token(
                &state.db,
                &format!("device-{n}"),
                &user.id,
                9_999_999_999,
                true,
                &kroma_db::DeviceHints {
                    user_agent: Some("Mozilla/5.0".to_string()),
                    language: Some((*language).to_string()),
                },
            )
            .unwrap();
        }
    }

    #[test]
    fn a_fresh_install_describes_itself_without_naming_itself() {
        let state = test_state();

        let payload = build(&state, "an-id".into(), EVERYTHING).unwrap();

        assert_eq!(payload.schema, SCHEMA);
        assert_eq!(payload.id, "an-id");
        assert_eq!(payload.users, Some(0));
        assert_eq!(payload.modules, Some(Vec::new()));
        let json = serde_json::to_string(&payload).unwrap();
        for forbidden in ["serverName", "hostname", "http://", "https://", "/"] {
            assert!(
                !json.contains(forbidden),
                "the payload carries {forbidden}: {json}"
            );
        }
    }

    #[test]
    fn the_languages_devices_ask_for_are_reported_even_when_kroma_has_none_of_them() {
        let state = test_state();
        with_devices(&state, &["de-de", "ja", "fr"]);

        let payload = build(&state, "an-id".into(), EVERYTHING).unwrap();

        assert_eq!(
            payload.locales,
            Some(vec![
                "de-de".to_string(),
                "fr".to_string(),
                "ja".to_string()
            ])
        );
        assert_eq!(payload.clients.unwrap().desktop, 3);
    }

    #[test]
    fn only_enabled_official_modules_are_named_and_they_are_named_once() {
        let state = crate::test_support::test_state_with_official_modules(&[
            "tv.kroma.torrents",
            "tv.kroma.vpn",
            "tv.kroma.torrents",
        ]);
        crate::modules::set_module_enabled(&state.settings, &state.db, "tv.kroma.vpn", false);

        let payload = build(&state, "an-id".into(), EVERYTHING).unwrap();

        assert_eq!(payload.modules, Some(vec!["tv.kroma.torrents".to_string()]));
    }

    #[test]
    fn a_block_an_operator_switched_off_is_absent_rather_than_empty() {
        let state = crate::test_support::test_state_with_official_modules(&["tv.kroma.torrents"]);
        with_devices(&state, &["de-de"]);
        let base_only = Preferences {
            base: true,
            usage: false,
            statistics: false,
        };

        let payload = build(&state, "an-id".into(), base_only).unwrap();
        let json = serde_json::to_string(&payload).unwrap();

        assert_eq!(payload.modules, None);
        assert_eq!(payload.locales, None);
        assert_eq!(payload.clients, None);
        for absent in ["modules", "locales", "clients", "users", "titles"] {
            assert!(
                !json.contains(absent),
                "an empty {absent} reads as a fact the server does not have: {json}"
            );
        }
        assert!(json.contains("\"version\""));
    }

    #[test]
    fn dropping_what_it_runs_keeps_how_much_of_it_there_is() {
        let state = crate::test_support::test_state_with_official_modules(&["tv.kroma.torrents"]);
        with_devices(&state, &["de-de"]);
        let counts_only = Preferences {
            base: true,
            usage: false,
            statistics: true,
        };

        let payload = build(&state, "an-id".into(), counts_only).unwrap();

        assert_eq!(payload.modules, None);
        assert_eq!(payload.locales, None);
        assert_eq!(payload.clients.unwrap().desktop, 1);
        assert_eq!(payload.users, Some(1));
    }

    #[test]
    fn accounts_and_titles_are_reported_as_they_are_counted() {
        let state = test_state();
        with_devices(&state, &["fr"]);
        crate::test_support::seed_movie(&state, "m1");
        crate::test_support::seed_movie(&state, "m2");
        crate::test_support::seed_show_episode(&state, "s1", "e1");

        let payload = build(&state, "an-id".into(), EVERYTHING).unwrap();

        assert_eq!(payload.users, Some(1));
        assert_eq!(payload.titles, Some(3));
    }

    #[test]
    fn the_active_window_looks_back_a_week_and_no_further() {
        let since = OffsetDateTime::parse(&active_since(), &Rfc3339).unwrap();

        let days = (OffsetDateTime::now_utc() - since).whole_days();
        assert_eq!(days, ACTIVE_DAYS);
    }
}
