//! The household's ratings country (ACCT-154): whose labels a profile reads
//! until it picks its own.

use crate::config::Config;
use crate::db::Pool;
use crate::i18n;
use crate::model::ratings_countries;

use super::schema::SettingRow;
use super::store::Settings;
use super::tmdb_language::metadata_country;

/// The setting an admin picks the household's ratings country with.
pub const RATINGS_COUNTRY_KEY: &str = "ratingsCountry";

const OWNER_LOCALE: &str = "SELECT COALESCE((SELECT a.language FROM access_tokens a \
     WHERE a.user_id = u.id AND a.language IS NOT NULL ORDER BY a.last_seen DESC LIMIT 1), \
     u.language) FROM users u WHERE u.waiting = 0 ORDER BY u.created_at, u.rowid LIMIT 1";

/// The admin's choice, else the region of the owner's locale (`fr-CH` gives
/// `CH`), else the country the metadata language names. The owner's locale is
/// the language their latest device asked in, or their account's own.
pub fn household_country(settings: &Settings, config: &Config, pool: &Pool) -> String {
    let chosen = settings.get_str(RATINGS_COUNTRY_KEY, super::TMDB_LANGUAGE_AUTO);
    known(&chosen)
        .or_else(|| owner_region(pool))
        .unwrap_or_else(|| metadata_country(settings, config))
}

/// `country` as a code the rating table knows, upper-cased, or `None`.
pub fn known(country: &str) -> Option<String> {
    let code = country.trim().to_ascii_uppercase();
    ratings_countries().contains(&code.as_str()).then_some(code)
}

/// The admin row that picks the household's ratings country, beside the
/// metadata language: `Auto`, then every country the rating table knows.
pub(super) fn ratings_country_row(locale: &str, value: serde_json::Value) -> SettingRow {
    let auto = std::iter::once(super::TMDB_LANGUAGE_AUTO);
    SettingRow {
        key: RATINGS_COUNTRY_KEY.into(),
        label: i18n::t(locale, "admin.ratingsCountry", &[]),
        desc: Some(i18n::t(locale, "admin.ratingsCountryHint", &[])),
        kind: "select",
        options: auto.chain(ratings_countries()).map(str::to_string).collect(),
        value,
        applied: true,
        configured: None,
    }
}

fn owner_region(pool: &Pool) -> Option<String> {
    let conn = pool.get().ok()?;
    let locale: Option<String> = conn.query_row(OWNER_LOCALE, [], |r| r.get(0)).ok()?;
    known(i18n::region(locale.as_deref()?)?)
}

#[cfg(test)]
mod tests;
