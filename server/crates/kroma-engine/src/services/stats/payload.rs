use anyhow::Result;
use serde::Serialize;
use time::format_description::well_known::Rfc3339;
use time::{Duration, OffsetDateTime};

use crate::state::SharedState;

use super::clients::{self, Clients};
use super::{buckets, locales};

// A device is "active" if it was seen inside this window.
const ACTIVE_DAYS: i64 = 7;

/// Everything one install says about itself, and the whole of it. Adding a
/// field here changes what leaves an operator's machine, so it changes
/// `docs/anonymous-stats.md` and the schema number with it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Payload {
    pub schema: u32,
    pub id: String,
    pub version: String,
    pub commit: String,
    pub target: String,
    pub install: &'static str,
    pub clients: Clients,
    pub locales: Vec<String>,
    pub modules: Vec<String>,
    pub users: &'static str,
    pub titles: &'static str,
}

pub fn build(state: &SharedState, id: String) -> Result<Payload> {
    let build = crate::services::settings::build_info();
    let devices = crate::db::devices_seen_since(&state.db, &active_since())?;
    let (_, titles, _) = crate::db::counts(&state.db)?;
    Ok(Payload {
        schema: 1,
        id,
        version: build.version,
        commit: build.commit,
        target: build.target,
        install: state.config.install.as_str(),
        clients: clients::tally(&devices),
        locales: locales::spoken(&devices),
        modules: enabled_official(state),
        users: buckets::users(crate::db::user_count(&state.db)?),
        titles: buckets::titles(titles as i64),
    })
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

    #[test]
    fn a_fresh_install_describes_itself_without_naming_itself() {
        let state = test_state();

        let payload = build(&state, "an-id".into()).unwrap();

        assert_eq!(payload.schema, 1);
        assert_eq!(payload.id, "an-id");
        assert_eq!(payload.users, "1");
        assert!(payload.modules.is_empty());
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
        let user = crate::db::create_user(
            &state.db,
            "a@b.c",
            "alice",
            "hash",
            &[kroma_domain::Permission::Playback],
        )
        .unwrap();
        for (token, language) in [("de-phone", "de-de"), ("jp-tv", "ja"), ("fr-web", "fr")] {
            crate::db::create_access_token(
                &state.db,
                token,
                &user.id,
                9_999_999_999,
                true,
                &kroma_db::DeviceHints {
                    user_agent: Some("Mozilla/5.0".to_string()),
                    language: Some(language.to_string()),
                },
            )
            .unwrap();
        }

        let payload = build(&state, "an-id".into()).unwrap();

        assert_eq!(payload.locales, vec!["de-de", "fr", "ja"]);
        assert_eq!(payload.clients.desktop, 3);
    }

    #[test]
    fn only_enabled_official_modules_are_named_and_they_are_named_once() {
        let state = crate::test_support::test_state_with_official_modules(&[
            "tv.kroma.torrents",
            "tv.kroma.vpn",
            "tv.kroma.torrents",
        ]);
        crate::modules::set_module_enabled(&state.settings, &state.db, "tv.kroma.vpn", false);

        let payload = build(&state, "an-id".into()).unwrap();

        assert_eq!(payload.modules, vec!["tv.kroma.torrents".to_string()]);
    }

    #[test]
    fn the_active_window_looks_back_a_week_and_no_further() {
        let since = OffsetDateTime::parse(&active_since(), &Rfc3339).unwrap();

        let days = (OffsetDateTime::now_utc() - since).whole_days();
        assert_eq!(days, ACTIVE_DAYS);
    }
}
