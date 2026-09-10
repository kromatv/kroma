//! The sidecar's half of the module's catalogs: the strings it sends a box come
//! from the same `locales/<code>.json` the console page and the channel read.

use std::sync::OnceLock;

use kroma_module_sdk::domain::User;
use kroma_module_sdk::i18n::{self, I18n, Translator};

const CATALOGS: &[(&str, &str)] = kroma_module_sdk::embedded_locales!();

pub fn for_user(user: &User) -> Translator<'static> {
    for_locale(user.language.as_deref().unwrap_or(i18n::FALLBACK_LOCALE))
}

pub fn for_locale(locale: &str) -> Translator<'static> {
    engine().translator(locale)
}

fn engine() -> &'static I18n {
    static ENGINE: OnceLock<I18n> = OnceLock::new();
    ENGINE.get_or_init(|| i18n::engine(CATALOGS).expect("the Roku module's own catalogs"))
}

#[cfg(test)]
mod tests {
    use crate::test_support;

    use super::*;

    #[test]
    fn the_catalogs_the_console_page_reads_are_the_ones_the_sidecar_resolves() {
        let codes: Vec<&str> = CATALOGS.iter().map(|(code, _)| *code).collect();

        assert_eq!(codes, ["en", "fr"]);
        assert_eq!(for_locale("fr").t("roku.channel.movies", &[]), "Films");
        assert_eq!(for_locale("en").t("roku.channel.movies", &[]), "Movies");
    }

    #[test]
    fn a_locale_no_catalog_answers_falls_back_to_english_rather_than_to_the_key() {
        assert_eq!(for_locale("de").t("roku.channel.shows", &[]), "Shows");
        assert_eq!(for_locale("fr_CH").t("roku.channel.shows", &[]), "Séries");
    }

    #[test]
    fn an_account_with_no_language_of_its_own_reads_the_fallback() {
        assert_eq!(
            for_user(&test_support::user(None)).locale(),
            i18n::FALLBACK_LOCALE
        );
        assert_eq!(for_user(&test_support::user(Some("fr"))).locale(), "fr");
    }
}
