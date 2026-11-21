//! The language TMDB is asked in: the household's setting, a reader's own, and
//! the choices the setting offers.

use crate::config::Config;
use crate::i18n;

use super::TMDB_LANGUAGE_AUTO;
use super::store::Settings;

/// The TMDB metadata language used when enriching the catalog (e.g. `fr-FR`)
/// the persisted `tmdbLanguage` setting, falling back to the env-configured
/// `config.tmdb_language` (default `en-US`) when unset. The catalog stores ONE
/// language for everyone, so this is the household's metadata language, not a
/// per-user UI choice. Always a tag TMDB knows: a script is never sent.
pub fn metadata_language(settings: &Settings, config: &Config) -> String {
    let v = settings.get_str("tmdbLanguage", "");
    let v = v.trim();
    let configured = if v.is_empty() || v == TMDB_LANGUAGE_AUTO {
        config.tmdb_language.as_str()
    } else {
        v
    };
    i18n::tmdb_language(configured).into_owned()
}

/// The country whose rating labels a reader sees until they pick their own
/// (ACCT-104): the one the household's [`metadata_language`] names.
pub fn metadata_country(settings: &Settings, config: &Config) -> String {
    let language = metadata_language(settings, config);
    crate::infra::metadata::country_of(&language, &language)
}

/// TMDB's regional tag for a bare language code, which is what decides the
/// release dates and the artwork it hands back. Unknown codes pass through.
pub fn tmdb_region_of(lang: &str) -> &str {
    match lang {
        "en" => "en-US",
        "fr" => "fr-FR",
        "es" => "es-ES",
        "de" => "de-DE",
        "it" => "it-IT",
        "pt" => "pt-BR",
        "nl" => "nl-NL",
        "ja" => "ja-JP",
        other => other,
    }
}

/// The TMDB language for a request made by a reader, which is the reader's own
/// unless the operator asked for a regional variant of it.
///
/// [`metadata_language`] stays the answer where there is no reader: enrichment,
/// background jobs, the module host. A configured `fr-FR` beats a reader's bare
/// `fr`; `en` against a configured `fr-FR` does not. A reader whose locale
/// names its own region or script (`pt-BR`, `zh-Hant`) is asked for as that.
pub fn metadata_language_for(settings: &Settings, config: &Config, reader: Option<&str>) -> String {
    let configured = metadata_language(settings, config);
    // Nothing was asked for: a request with no Accept-Language is a script or
    // an older client, and the operator's setting is the answer.
    let Some(reader) = reader else {
        return configured;
    };
    let reads = i18n::normalize(reader).map_or(reader, |locale| i18n::content_locale(locale));
    language_of_reader(&configured, reads)
}

fn language_of_reader(configured: &str, reads: &str) -> String {
    let asked = i18n::canonical(&i18n::tmdb_language(reads));
    if i18n::region(&asked).is_some() {
        return asked;
    }
    if i18n::language(configured).eq_ignore_ascii_case(&asked) {
        configured.to_owned()
    } else {
        // Regioned, because a bare code leaves TMDB to pick release dates and
        // artwork for no region in particular.
        tmdb_region_of(&asked).to_owned()
    }
}

pub(super) fn tmdb_language_options() -> Vec<String> {
    options_for(i18n::content_locales())
}

// TMDB takes a regional code and the region changes the artwork it picks, so
// each language offers the one it is usually wanted in.
fn options_for(locales: &[&str]) -> Vec<String> {
    let mut options = vec![TMDB_LANGUAGE_AUTO.to_string()];
    for locale in locales {
        let tag = tmdb_region_of(&i18n::tmdb_language(locale)).to_owned();
        if !options.contains(&tag) {
            options.push(tag);
        }
    }
    options
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use serde_json::json;

    use super::*;
    use crate::db::Pool;
    use crate::db::testing::TempPool;

    fn test_pool() -> TempPool {
        crate::db::testing::temp_pool("settings-tmdb-language")
    }

    fn test_config() -> Config {
        Config {
            tmdb_language: "en-US".to_string(),
            ..Default::default()
        }
    }

    fn configure(settings: &Settings, pool: &Pool, language: &str) {
        settings.set_patch(
            pool,
            BTreeMap::from([("tmdbLanguage".to_string(), json!(language))]),
        );
    }

    #[test]
    fn auto_defers_to_the_server_default_the_way_an_empty_value_does() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        let c = test_config();

        assert_eq!(metadata_language(&s, &c), "en-US");
        configure(&s, &pool, "Auto");
        assert_eq!(metadata_language(&s, &c), "en-US");
        configure(&s, &pool, "fr-FR");
        assert_eq!(metadata_language(&s, &c), "fr-FR");
    }

    #[test]
    fn the_households_rating_country_is_the_region_of_its_metadata_language() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        let c = test_config();

        assert_eq!(metadata_country(&s, &c), "US");
        configure(&s, &pool, "fr-FR");
        assert_eq!(metadata_country(&s, &c), "FR");
    }

    #[test]
    fn a_household_set_to_a_script_asks_tmdb_for_the_region_that_writes_it() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        configure(&s, &pool, "zh-Hant");

        assert_eq!(metadata_language(&s, &test_config()), "zh-TW");
    }

    #[test]
    fn a_readers_language_wins_unless_the_operator_asked_for_a_region_of_it() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        let c = test_config();

        assert_eq!(metadata_language_for(&s, &c, Some("en")), "en-US");
        assert_eq!(metadata_language_for(&s, &c, Some("fr")), "fr-FR");
        assert_eq!(metadata_language_for(&s, &c, Some("de")), "de-DE");
        configure(&s, &pool, "fr-FR");
        assert_eq!(metadata_language_for(&s, &c, Some("fr")), "fr-FR");
        assert_eq!(metadata_language_for(&s, &c, Some("en")), "en-US");
    }

    #[test]
    fn a_request_that_asked_for_nothing_leaves_the_operators_language_alone() {
        let pool = test_pool();
        let s = Settings::load(&pool);
        configure(&s, &pool, "fr-FR");

        assert_eq!(metadata_language_for(&s, &test_config(), None), "fr-FR");
    }

    #[test]
    fn a_reader_of_a_script_is_asked_for_by_region_whatever_the_operator_set() {
        assert_eq!(language_of_reader("en-US", "zh-Hant"), "zh-TW");
        assert_eq!(language_of_reader("zh-CN", "zh-Hant"), "zh-TW");
        assert_eq!(language_of_reader("zh-TW", "zh-Hans"), "zh-CN");
    }

    #[test]
    fn a_reader_of_a_regional_locale_is_asked_for_as_that_region() {
        assert_eq!(language_of_reader("fr-FR", "pt-BR"), "pt-BR");
        assert_eq!(language_of_reader("pt-PT", "pt-BR"), "pt-BR");
    }

    #[test]
    fn a_reader_of_a_bare_language_takes_the_operators_region_of_it() {
        assert_eq!(language_of_reader("fr-CA", "fr"), "fr-CA");
        assert_eq!(language_of_reader("fr-CA", "pt"), "pt-BR");
        assert_eq!(language_of_reader("fr-CA", "sv"), "sv");
    }

    #[test]
    fn the_setting_offers_each_content_locale_once_under_the_tag_tmdb_knows() {
        let options = options_for(&["en", "fr", "pt", "pt-BR", "zh-Hant"]);

        assert_eq!(options, ["Auto", "en-US", "fr-FR", "pt-BR", "zh-TW"]);
    }

    #[test]
    fn the_setting_still_offers_the_two_languages_that_ship_by_region() {
        let options = tmdb_language_options();

        assert!(options.contains(&"en-US".to_string()));
        assert!(options.contains(&"fr-FR".to_string()));
    }
}
